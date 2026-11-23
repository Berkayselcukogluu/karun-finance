import pandas as pd
import uuid
from datetime import datetime
from BACKEND.database import execute_sql_query, execute_sql_modification
from sqlalchemy import text


def calculate_industry_averages():
    """Calculate industry averages (Sector, Region, Country) for financial metrics."""
    print("[ANALYTICS] Starting industry averages calculation...")

    query = """
    SELECT 
        c.symbol AS "Symbol",
        c.sectorid AS "SectorId",
        s.sectorcode AS "SectorCode",
        s.sectorname AS "SectorName",
        c.countryid AS "CountryId",
        co.countrycode AS "CountryCode",
        co.regionid AS "RegionId",
        r.regioncode AS "RegionCode",
        fm.marketcap AS "MarketCap",
        fm.trailingpe AS "TrailingPE",
        fm.pricetobook AS "PriceToBook",
        fm.pricetosales AS "PriceToSales",
        fm.ebitda AS "Ebitda",
        fm.beta AS "Beta",
        fm.returnonequity AS "ReturnOnEquity",
        fm.returnonassets AS "ReturnOnAssets",
        fm.dividendyield AS "DividendYield",
        fm.revenuegrowth AS "RevenueGrowth",
        fm.earningsgrowth AS "EarningsGrowth",
        fm.debttoequity AS "DebtToEquity",
        fm.currentratio AS "CurrentRatio",
        fm.profitmargins AS "ProfitMargins",
        fm.operatingmargins AS "OperatingMargins",
        fm.netincome AS "NetIncome"
    FROM companies c
    JOIN financialmetrics fm ON c.symbol = fm.symbol
    LEFT JOIN sectors s ON c.sectorid = s.sectorid
    LEFT JOIN countries co ON c.countryid = co.countryid
    LEFT JOIN regions r ON co.regionid = r.regionid
    WHERE c.isactive = TRUE
    """

    df = execute_sql_query(query)
    if df is None or df.empty:
        print("[ANALYTICS] No data found to calculate averages.")
        return False

    numeric_cols = [
        'MarketCap', 'TrailingPE', 'PriceToBook', 'PriceToSales', 'Beta',
        'ReturnOnEquity', 'ReturnOnAssets', 'DividendYield', 'RevenueGrowth',
        'EarningsGrowth', 'DebtToEquity', 'CurrentRatio', 'ProfitMargins',
        'OperatingMargins', 'NetIncome'
    ]
    for col in numeric_cols:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    def weighted_avg(x, val_col, w_col):
        try:
            valid = x[[val_col, w_col]].dropna()
            if valid.empty or valid[w_col].sum() == 0:
                return None
            return (valid[val_col] * valid[w_col]).sum() / valid[w_col].sum()
        except Exception:
            return None

    def safe_median(x):
        return x.median() if not x.empty else None

    results = []

    group_cols_list = [
        ['SectorCode'],
        ['RegionCode', 'SectorCode'],
        ['CountryCode', 'SectorCode'],
    ]

    for group_cols in group_cols_list:
        grouped = df.groupby(group_cols)

        for name, group in grouped:
            if isinstance(name, str):
                name = (name,)

            record = {}
            record['AggregationLevel'] = 'SECTOR' if len(group_cols) == 1 else ('REGION_SECTOR' if 'RegionCode' in group_cols else 'COUNTRY_SECTOR')

            if 'SectorCode' in group_cols:
                record['SectorCode'] = name[group_cols.index('SectorCode')]
            if 'RegionCode' in group_cols:
                record['RegionCode'] = name[group_cols.index('RegionCode')]
            else:
                record['RegionCode'] = None
            if 'CountryCode' in group_cols:
                record['CountryCode'] = name[group_cols.index('CountryCode')]
            else:
                record['CountryCode'] = None

            record['MarketCapGroup'] = 'ALL'

            record['TotalCompanyCount'] = len(group)
            record['ProfitableCompanyCount'] = len(group[group['NetIncome'] > 0])
            record['DividendPayingCount'] = len(group[group['DividendYield'] > 0])

            record['PE_Median'] = safe_median(group['TrailingPE'])
            record['PB_Median'] = safe_median(group['PriceToBook'])
            record['PS_Median'] = safe_median(group['PriceToSales'])
            record['Beta_WeightedAvg'] = weighted_avg(group, 'Beta', 'MarketCap')
            record['MarketCap_WeightedAvg'] = weighted_avg(group, 'MarketCap', 'MarketCap')
            record['ROE_Median'] = safe_median(group['ReturnOnEquity'])
            record['ROA_Median'] = safe_median(group['ReturnOnAssets'])
            record['DividendYield_WeightedAvg'] = weighted_avg(group, 'DividendYield', 'MarketCap')
            record['DividendYield_Median'] = safe_median(group['DividendYield'])
            record['RevenueGrowth_WeightedAvg'] = weighted_avg(group, 'RevenueGrowth', 'MarketCap')
            record['EarningsGrowth_WeightedAvg'] = weighted_avg(group, 'EarningsGrowth', 'MarketCap')
            record['DebtToEquity_Median'] = safe_median(group['DebtToEquity'])
            record['CurrentRatio_Median'] = safe_median(group['CurrentRatio'])
            record['ProfitMargin_Median'] = safe_median(group['ProfitMargins'])
            record['OperatingMargin_Median'] = safe_median(group['OperatingMargins'])

            record['PE_P25'] = group['TrailingPE'].quantile(0.25)
            record['PE_P75'] = group['TrailingPE'].quantile(0.75)

            results.append(record)

    execute_sql_modification("DELETE FROM industryaverages")

    count = 0
    for r in results:
        parts = [r['AggregationLevel'], r.get('CountryCode') or 'ALL', r.get('RegionCode') or 'ALL', r.get('SectorCode') or 'ALL']
        redis_key = ":".join([str(p) for p in parts])

        query = text("""
            INSERT INTO industryaverages (
                aggregationlevel, countrycode, regioncode, sectorcode, marketcapgroup,
                totalcompanycount, profitablecompanycount, dividendpayingcount,
                pe_median, pb_median, ps_median, 
                beta_weightedavg, marketcap_weightedavg,
                roe_median, roa_median,
                dividendyield_weightedavg, dividendyield_median,
                revenuegrowth_weightedavg, earningsgrowth_weightedavg,
                debttoequity_median, currentratio_median,
                profitmargin_median, operatingmargin_median,
                pe_p25, pe_p75,
                calculatedat, isactive, rediskey
            ) VALUES (
                :agg, :country, :region, :sector, :mc_group,
                :total_count, :prof_count, :div_count,
                :pe_med, :pb_med, :ps_med,
                :beta_avg, :mc_avg,
                :roe_med, :roa_med,
                :div_avg, :div_med,
                :rev_avg, :earn_avg,
                :de_med, :cr_med,
                :pm_med, :om_med,
                :pe_25, :pe_75,
                NOW(), TRUE, :redis_key
            )
        """)

        params = {
            'agg': r['AggregationLevel'],
            'country': r['CountryCode'],
            'region': r['RegionCode'],
            'sector': r.get('SectorCode'),
            'mc_group': r['MarketCapGroup'],
            'total_count': r['TotalCompanyCount'],
            'prof_count': r['ProfitableCompanyCount'],
            'div_count': r['DividendPayingCount'],
            'pe_med': r['PE_Median'], 'pb_med': r['PB_Median'], 'ps_med': r['PS_Median'],
            'beta_avg': r['Beta_WeightedAvg'], 'mc_avg': r['MarketCap_WeightedAvg'],
            'roe_med': r['ROE_Median'], 'roa_med': r['ROA_Median'],
            'div_avg': r['DividendYield_WeightedAvg'], 'div_med': r['DividendYield_Median'],
            'rev_avg': r['RevenueGrowth_WeightedAvg'], 'earn_avg': r['EarningsGrowth_WeightedAvg'],
            'de_med': r['DebtToEquity_Median'], 'cr_med': r['CurrentRatio_Median'],
            'pm_med': r['ProfitMargin_Median'], 'om_med': r['OperatingMargin_Median'],
            'pe_25': r['PE_P25'], 'pe_75': r['PE_P75'],
            'redis_key': redis_key
        }

        for k, v in params.items():
            if isinstance(v, float) and (v != v):
                params[k] = None

        execute_sql_modification(query, params)
        count += 1

    print(f"[ANALYTICS] Calculated and saved {count} industry average records.")
    return True
