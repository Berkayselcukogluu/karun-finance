"""
Symbol Alarm Automation System - Redis-First Architecture
=========================================================
Provides real-time stock alert automation using a Redis-first cache layer
backed by PostgreSQL persistence.
"""

import json
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Set
from enum import Enum
import redis
from sqlalchemy import text

try:
    from database import get_data, execute_sql_query, execute_sql_modification
    from config import settings
except ImportError:
    from BACKEND.database import get_data, execute_sql_query, execute_sql_modification
    from BACKEND.config import settings


redis_client = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


# =====================================================
# Enums and Constants
# =====================================================

class AlertType(str, Enum):
    PRICE_ABOVE = "price_above"
    PRICE_BELOW = "price_below"
    VOLUME_SPIKE = "volume_spike"
    PERCENT_CHANGE_UP = "percent_up"
    PERCENT_CHANGE_DOWN = "percent_down"


class AlertPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AlertStatus(str, Enum):
    ACTIVE = "active"
    TRIGGERED = "triggered"
    SNOOZED = "snoozed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


PRIORITY_COLORS = {
    AlertPriority.LOW: {"bg": "bg-blue-500/20", "text": "text-blue-500", "border": "border-blue-500/30"},
    AlertPriority.MEDIUM: {"bg": "bg-yellow-500/20", "text": "text-yellow-500", "border": "border-yellow-500/30"},
    AlertPriority.HIGH: {"bg": "bg-orange-500/20", "text": "text-orange-500", "border": "border-orange-500/30"},
    AlertPriority.CRITICAL: {"bg": "bg-red-500/20", "text": "text-red-500", "border": "border-red-500/30"},
}


REDIS_KEYS = {
    "active_alerts": "alerts:active:",
    "alert_data": "alert:data:",
    "symbol_alerts": "alerts:symbol:",
    "triggered_alerts": "alerts:triggered:",
    "notification_queue": "alerts:notifications:",
    "snooze_until": "alerts:snooze:",
}


# =====================================================
# PostgreSQL Table Creation
# =====================================================

def ensure_alerts_tables():
    """Ensure PostgreSQL tables required by the alert system exist."""
    try:
        engine = get_data()
        with engine.connect() as connection:
            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS alerts (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(100) NOT NULL,
                    symbol VARCHAR(20) NOT NULL,
                    market_type VARCHAR(10) DEFAULT 'nasdaq',
                    alert_type VARCHAR(30) NOT NULL,
                    target_value DECIMAL(18, 6) NOT NULL,
                    current_value_at_creation DECIMAL(18, 6),
                    priority VARCHAR(20) DEFAULT 'medium',
                    status VARCHAR(20) DEFAULT 'active',
                    note TEXT,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW(),
                    triggered_at TIMESTAMP,
                    triggered_value DECIMAL(18, 6),
                    expires_at TIMESTAMP,
                    snooze_until TIMESTAMP,
                    is_recurring BOOLEAN DEFAULT FALSE,
                    trigger_count INTEGER DEFAULT 0,
                    CONSTRAINT alerts_alert_type_check CHECK (alert_type IN ('price_above', 'price_below', 'volume_spike', 'percent_up', 'percent_down')),
                    CONSTRAINT alerts_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical')),
                    CONSTRAINT alerts_status_check CHECK (status IN ('active', 'triggered', 'snoozed', 'expired', 'cancelled'))
                )
            """))

            connection.execute(text("""
                CREATE TABLE IF NOT EXISTS alert_notifications (
                    id SERIAL PRIMARY KEY,
                    alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
                    user_id VARCHAR(100) NOT NULL,
                    symbol VARCHAR(20) NOT NULL,
                    alert_type VARCHAR(30) NOT NULL,
                    target_value DECIMAL(18, 6),
                    triggered_value DECIMAL(18, 6),
                    triggered_at TIMESTAMP DEFAULT NOW(),
                    is_read BOOLEAN DEFAULT FALSE,
                    read_at TIMESTAMP,
                    priority VARCHAR(20),
                    message TEXT,
                    price_data_snapshot JSONB
                )
            """))

            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_alerts_symbol ON alerts(symbol);
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_alert_notifications_user_id ON alert_notifications(user_id);
            """))
            connection.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_alert_notifications_is_read ON alert_notifications(is_read);
            """))

            connection.commit()
        print("[DB] Alerts tables created/verified successfully")
        return True
    except Exception as e:
        print(f"[DB WARNING] ensure_alerts_tables skipped (PostgreSQL unavailable): {e}")
        return False


# =====================================================
# Redis-First Alert Operations
# =====================================================

class AlertService:
    """Manage alerts using a Redis-first caching strategy with PostgreSQL persistence."""

    def __init__(self):
        self.redis = redis_client
        ensure_alerts_tables()

    # -------------------------------------------------
    # Alert Creation
    # -------------------------------------------------

    def create_alert(
        self,
        user_id: str,
        symbol: str,
        alert_type: AlertType,
        target_value: float,
        priority: AlertPriority = AlertPriority.MEDIUM,
        market_type: str = "nasdaq",
        note: Optional[str] = None,
        expires_at: Optional[datetime] = None,
        is_recurring: bool = False,
        current_value: Optional[float] = None
    ) -> Dict[str, Any]:
        """Create a new alert in PostgreSQL and cache it in Redis."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                result = connection.execute(text("""
                    INSERT INTO alerts (
                        user_id, symbol, market_type, alert_type, target_value,
                        current_value_at_creation, priority, status, note, 
                        expires_at, is_recurring
                    ) VALUES (
                        :user_id, :symbol, :market_type, :alert_type, :target_value,
                        :current_value, :priority, 'active', :note,
                        :expires_at, :is_recurring
                    ) RETURNING id, created_at
                """), {
                    'user_id': user_id,
                    'symbol': symbol.upper(),
                    'market_type': market_type,
                    'alert_type': alert_type.value if isinstance(alert_type, AlertType) else alert_type,
                    'target_value': target_value,
                    'current_value': current_value,
                    'priority': priority.value if isinstance(priority, AlertPriority) else priority,
                    'note': note,
                    'expires_at': expires_at,
                    'is_recurring': is_recurring
                })
                row = result.fetchone()
                alert_id = row[0]
                created_at = row[1]
                connection.commit()

            alert_data = {
                'id': alert_id,
                'user_id': user_id,
                'symbol': symbol.upper(),
                'market_type': market_type,
                'alert_type': alert_type.value if isinstance(alert_type, AlertType) else alert_type,
                'target_value': float(target_value),
                'current_value_at_creation': float(current_value) if current_value else None,
                'priority': priority.value if isinstance(priority, AlertPriority) else priority,
                'status': AlertStatus.ACTIVE.value,
                'note': note,
                'created_at': created_at.isoformat() if created_at else datetime.now().isoformat(),
                'expires_at': expires_at.isoformat() if expires_at else None,
                'is_recurring': is_recurring
            }

            self._cache_alert_to_redis(alert_data)

            print(f"[ALERT] Created alert #{alert_id} for {symbol} ({alert_type})")
            return {'success': True, 'alert': alert_data}

        except Exception as e:
            print(f"[ALERT ERROR] create_alert: {e}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': str(e)}

    def _cache_alert_to_redis(self, alert_data: dict):
        """Cache alert data in Redis."""
        alert_id = alert_data['id']
        user_id = alert_data['user_id']
        symbol = alert_data['symbol']

        try:
            self.redis.setex(
                f"{REDIS_KEYS['alert_data']}{alert_id}",
                86400,
                json.dumps(alert_data)
            )
            self.redis.sadd(f"{REDIS_KEYS['active_alerts']}{user_id}", alert_id)
            self.redis.sadd(f"{REDIS_KEYS['symbol_alerts']}{symbol}", alert_id)

        except Exception as e:
            print(f"[REDIS ERROR] _cache_alert_to_redis: {e}")

    # -------------------------------------------------
    # Alert Retrieval
    # -------------------------------------------------

    def get_user_alerts(self, user_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve user alerts from Redis or fallback to PostgreSQL."""
        try:
            alert_ids = self.redis.smembers(f"{REDIS_KEYS['active_alerts']}{user_id}")

            if alert_ids:
                alerts = []
                for alert_id in alert_ids:
                    alert_data = self.redis.get(f"{REDIS_KEYS['alert_data']}{alert_id}")
                    if alert_data:
                        alert = json.loads(alert_data)
                        if status is None or alert.get('status') == status:
                            alerts.append(alert)
                    else:
                        db_alert = self._get_alert_from_db(int(alert_id))
                        if db_alert:
                            self._cache_alert_to_redis(db_alert)
                            if status is None or db_alert.get('status') == status:
                                alerts.append(db_alert)

                return sorted(alerts, key=lambda x: x.get('created_at', ''), reverse=True)

            return self._get_user_alerts_from_db(user_id, status)

        except Exception as e:
            print(f"[ALERT ERROR] get_user_alerts: {e}")
            return self._get_user_alerts_from_db(user_id, status)

    def _get_alert_from_db(self, alert_id: int) -> Optional[Dict[str, Any]]:
        """Retrieve a single alert from PostgreSQL."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                result = connection.execute(text("""
                    SELECT id, user_id, symbol, market_type, alert_type, target_value,
                           current_value_at_creation, priority, status, note, created_at,
                           triggered_at, triggered_value, expires_at, snooze_until, 
                           is_recurring, trigger_count
                    FROM alerts WHERE id = :id
                """), {'id': alert_id})
                row = result.fetchone()

                if row:
                    return {
                        'id': row[0],
                        'user_id': row[1],
                        'symbol': row[2],
                        'market_type': row[3],
                        'alert_type': row[4],
                        'target_value': float(row[5]) if row[5] else None,
                        'current_value_at_creation': float(row[6]) if row[6] else None,
                        'priority': row[7],
                        'status': row[8],
                        'note': row[9],
                        'created_at': row[10].isoformat() if row[10] else None,
                        'triggered_at': row[11].isoformat() if row[11] else None,
                        'triggered_value': float(row[12]) if row[12] else None,
                        'expires_at': row[13].isoformat() if row[13] else None,
                        'snooze_until': row[14].isoformat() if row[14] else None,
                        'is_recurring': row[15],
                        'trigger_count': row[16]
                    }
            return None
        except Exception as e:
            print(f"[DB ERROR] _get_alert_from_db: {e}")
            return None

    def _get_user_alerts_from_db(self, user_id: str, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Retrieve all alerts for a user from PostgreSQL."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                query = """
                    SELECT id, user_id, symbol, market_type, alert_type, target_value,
                           current_value_at_creation, priority, status, note, created_at,
                           triggered_at, triggered_value, expires_at, snooze_until,
                           is_recurring, trigger_count
                    FROM alerts 
                    WHERE user_id = :user_id
                """
                if status:
                    query += " AND status = :status"
                query += " ORDER BY created_at DESC"

                params = {'user_id': user_id}
                if status:
                    params['status'] = status

                result = connection.execute(text(query), params)

                alerts = []
                for row in result:
                    alert = {
                        'id': row[0],
                        'user_id': row[1],
                        'symbol': row[2],
                        'market_type': row[3],
                        'alert_type': row[4],
                        'target_value': float(row[5]) if row[5] else None,
                        'current_value_at_creation': float(row[6]) if row[6] else None,
                        'priority': row[7],
                        'status': row[8],
                        'note': row[9],
                        'created_at': row[10].isoformat() if row[10] else None,
                        'triggered_at': row[11].isoformat() if row[11] else None,
                        'triggered_value': float(row[12]) if row[12] else None,
                        'expires_at': row[13].isoformat() if row[13] else None,
                        'snooze_until': row[14].isoformat() if row[14] else None,
                        'is_recurring': row[15],
                        'trigger_count': row[16]
                    }
                    alerts.append(alert)
                    if alert['status'] == 'active':
                        self._cache_alert_to_redis(alert)

                return alerts
        except Exception as e:
            print(f"[DB ERROR] _get_user_alerts_from_db: {e}")
            return []

    # -------------------------------------------------
    # Alert Evaluation and Triggering
    # -------------------------------------------------

    def check_and_trigger_alerts(self, symbol: str, current_price: float,
                                  current_volume: Optional[float] = None,
                                  prev_close: Optional[float] = None) -> List[Dict[str, Any]]:
        """Evaluate active alerts for a symbol and trigger matching notifications."""
        symbol = symbol.upper()
        triggered_alerts = []

        try:
            alert_ids = self.redis.smembers(f"{REDIS_KEYS['symbol_alerts']}{symbol}")

            if not alert_ids:
                return []

            for alert_id in alert_ids:
                alert_data = self.redis.get(f"{REDIS_KEYS['alert_data']}{alert_id}")

                if not alert_data:
                    continue

                alert = json.loads(alert_data)

                if alert.get('status') != 'active':
                    continue

                snooze_until = self.redis.get(f"{REDIS_KEYS['snooze_until']}{alert_id}")
                if snooze_until:
                    if datetime.fromisoformat(snooze_until) > datetime.now():
                        continue

                should_trigger = False
                alert_type = alert.get('alert_type')
                target_value = alert.get('target_value')

                if alert_type == AlertType.PRICE_ABOVE.value:
                    should_trigger = current_price >= target_value

                elif alert_type == AlertType.PRICE_BELOW.value:
                    should_trigger = current_price <= target_value

                elif alert_type == AlertType.VOLUME_SPIKE.value and current_volume:
                    base_volume = alert.get('current_value_at_creation', 0)
                    if base_volume > 0:
                        volume_change = ((current_volume - base_volume) / base_volume) * 100
                        should_trigger = volume_change >= target_value

                elif alert_type == AlertType.PERCENT_CHANGE_UP.value and prev_close:
                    percent_change = ((current_price - prev_close) / prev_close) * 100
                    should_trigger = percent_change >= target_value

                elif alert_type == AlertType.PERCENT_CHANGE_DOWN.value and prev_close:
                    percent_change = ((current_price - prev_close) / prev_close) * 100
                    should_trigger = percent_change <= -target_value

                if should_trigger:
                    triggered = self._trigger_alert(alert, current_price, current_volume)
                    if triggered:
                        triggered_alerts.append(triggered)

            return triggered_alerts

        except Exception as e:
            print(f"[ALERT ERROR] check_and_trigger_alerts: {e}")
            import traceback
            traceback.print_exc()
            return []

    def _trigger_alert(self, alert: dict, triggered_value: float,
                       volume: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """Mark an alert as triggered and create a notification record."""
        alert_id = alert['id']
        user_id = alert['user_id']

        try:
            new_status = AlertStatus.TRIGGERED.value
            is_recurring = alert.get('is_recurring', False)

            engine = get_data()
            with engine.connect() as connection:
                connection.execute(text("""
                    UPDATE alerts 
                    SET status = :status, 
                        triggered_at = NOW(), 
                        triggered_value = :triggered_value,
                        trigger_count = trigger_count + 1,
                        updated_at = NOW()
                    WHERE id = :id
                """), {
                    'status': new_status if not is_recurring else 'active',
                    'triggered_value': triggered_value,
                    'id': alert_id
                })

                result = connection.execute(text("""
                    INSERT INTO alert_notifications (
                        alert_id, user_id, symbol, alert_type, target_value,
                        triggered_value, priority, message, price_data_snapshot
                    ) VALUES (
                        :alert_id, :user_id, :symbol, :alert_type, :target_value,
                        :triggered_value, :priority, :message, :snapshot
                    ) RETURNING id
                """), {
                    'alert_id': alert_id,
                    'user_id': user_id,
                    'symbol': alert['symbol'],
                    'alert_type': alert['alert_type'],
                    'target_value': alert['target_value'],
                    'triggered_value': triggered_value,
                    'priority': alert['priority'],
                    'message': self._generate_alert_message(alert, triggered_value),
                    'snapshot': json.dumps({
                        'price': triggered_value,
                        'volume': volume,
                        'timestamp': datetime.now().isoformat()
                    })
                })
                notification_id = result.fetchone()[0]
                connection.commit()

            if not is_recurring:
                alert['status'] = new_status
                self.redis.setex(
                    f"{REDIS_KEYS['alert_data']}{alert_id}",
                    86400,
                    json.dumps(alert)
                )
                self.redis.srem(f"{REDIS_KEYS['active_alerts']}{user_id}", alert_id)
                self.redis.srem(f"{REDIS_KEYS['symbol_alerts']}{alert['symbol']}", alert_id)

            notification = {
                'id': notification_id,
                'alert_id': alert_id,
                'user_id': user_id,
                'symbol': alert['symbol'],
                'alert_type': alert['alert_type'],
                'target_value': alert['target_value'],
                'triggered_value': triggered_value,
                'priority': alert['priority'],
                'message': self._generate_alert_message(alert, triggered_value),
                'triggered_at': datetime.now().isoformat(),
                'is_read': False
            }

            self.redis.lpush(
                f"{REDIS_KEYS['notification_queue']}{user_id}",
                json.dumps(notification)
            )
            self.redis.ltrim(f"{REDIS_KEYS['notification_queue']}{user_id}", 0, 99)

            print(f"[ALERT] Triggered alert #{alert_id} for {alert['symbol']} at {triggered_value}")
            return notification

        except Exception as e:
            print(f"[ALERT ERROR] _trigger_alert: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _generate_alert_message(self, alert: dict, triggered_value: float) -> str:
        """Generate a human-readable notification message for a triggered alert."""
        symbol = alert['symbol']
        alert_type = alert['alert_type']
        target = alert['target_value']

        messages = {
            AlertType.PRICE_ABOVE.value: f"🚀 {symbol} reached target price! ${triggered_value:.2f} (Target: ${target:.2f})",
            AlertType.PRICE_BELOW.value: f"📉 {symbol} dropped below target level! ${triggered_value:.2f} (Target: ${target:.2f})",
            AlertType.VOLUME_SPIKE.value: f"📊 {symbol} unusual volume spike detected! +{target:.0f}%",
            AlertType.PERCENT_CHANGE_UP.value: f"📈 {symbol} gained {target:.1f}%! Current: ${triggered_value:.2f}",
            AlertType.PERCENT_CHANGE_DOWN.value: f"⚠️ {symbol} fell {target:.1f}%! Current: ${triggered_value:.2f}",
        }

        return messages.get(alert_type, f"{symbol} alert triggered!")

    # -------------------------------------------------
    # Alert Management
    # -------------------------------------------------

    def cancel_alert(self, alert_id: int, user_id: str) -> bool:
        """Cancel an alert."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                result = connection.execute(text("""
                    UPDATE alerts 
                    SET status = 'cancelled', updated_at = NOW()
                    WHERE id = :id AND user_id = :user_id
                    RETURNING symbol
                """), {'id': alert_id, 'user_id': user_id})
                row = result.fetchone()
                connection.commit()

                if row:
                    symbol = row[0]
                    self.redis.delete(f"{REDIS_KEYS['alert_data']}{alert_id}")
                    self.redis.srem(f"{REDIS_KEYS['active_alerts']}{user_id}", alert_id)
                    self.redis.srem(f"{REDIS_KEYS['symbol_alerts']}{symbol}", alert_id)
                    return True
            return False
        except Exception as e:
            print(f"[ALERT ERROR] cancel_alert: {e}")
            return False

    def snooze_alert(self, alert_id: int, user_id: str, minutes: int = 30) -> bool:
        """Snooze an alert for the specified number of minutes."""
        try:
            snooze_until = datetime.now() + timedelta(minutes=minutes)

            engine = get_data()
            with engine.connect() as connection:
                connection.execute(text("""
                    UPDATE alerts 
                    SET snooze_until = :snooze_until, status = 'snoozed', updated_at = NOW()
                    WHERE id = :id AND user_id = :user_id
                """), {'snooze_until': snooze_until, 'id': alert_id, 'user_id': user_id})
                connection.commit()

            self.redis.setex(
                f"{REDIS_KEYS['snooze_until']}{alert_id}",
                minutes * 60,
                snooze_until.isoformat()
            )

            return True
        except Exception as e:
            print(f"[ALERT ERROR] snooze_alert: {e}")
            return False

    def reactivate_alert(self, alert_id: int, user_id: str) -> bool:
        """Reactivate a snoozed or triggered alert."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                result = connection.execute(text("""
                    UPDATE alerts 
                    SET status = 'active', snooze_until = NULL, updated_at = NOW()
                    WHERE id = :id AND user_id = :user_id
                    RETURNING symbol
                """), {'id': alert_id, 'user_id': user_id})
                row = result.fetchone()
                connection.commit()

                if row:
                    alert = self._get_alert_from_db(alert_id)
                    if alert:
                        alert['status'] = 'active'
                        self._cache_alert_to_redis(alert)
                    self.redis.delete(f"{REDIS_KEYS['snooze_until']}{alert_id}")
                    return True
            return False
        except Exception as e:
            print(f"[ALERT ERROR] reactivate_alert: {e}")
            return False

    # -------------------------------------------------
    # Notification Management
    # -------------------------------------------------

    def get_notifications(self, user_id: str, unread_only: bool = False,
                          limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve notifications for a user."""
        try:
            redis_notifications = self.redis.lrange(
                f"{REDIS_KEYS['notification_queue']}{user_id}",
                0, limit - 1
            )

            notifications = [json.loads(n) for n in redis_notifications]

            if len(notifications) < limit:
                db_notifications = self._get_notifications_from_db(
                    user_id, unread_only, limit - len(notifications)
                )
                existing_ids = {n['id'] for n in notifications}
                for n in db_notifications:
                    if n['id'] not in existing_ids:
                        notifications.append(n)

            if unread_only:
                notifications = [n for n in notifications if not n.get('is_read', False)]

            return notifications[:limit]

        except Exception as e:
            print(f"[ALERT ERROR] get_notifications: {e}")
            return self._get_notifications_from_db(user_id, unread_only, limit)

    def _get_notifications_from_db(self, user_id: str, unread_only: bool = False,
                                    limit: int = 50) -> List[Dict[str, Any]]:
        """Retrieve notifications from PostgreSQL."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                query = """
                    SELECT id, alert_id, user_id, symbol, alert_type, target_value,
                           triggered_value, triggered_at, is_read, priority, message,
                           price_data_snapshot
                    FROM alert_notifications
                    WHERE user_id = :user_id
                """
                if unread_only:
                    query += " AND is_read = FALSE"
                query += " ORDER BY triggered_at DESC LIMIT :limit"

                result = connection.execute(text(query), {
                    'user_id': user_id,
                    'limit': limit
                })

                notifications = []
                for row in result:
                    notifications.append({
                        'id': row[0],
                        'alert_id': row[1],
                        'user_id': row[2],
                        'symbol': row[3],
                        'alert_type': row[4],
                        'target_value': float(row[5]) if row[5] else None,
                        'triggered_value': float(row[6]) if row[6] else None,
                        'triggered_at': row[7].isoformat() if row[7] else None,
                        'is_read': row[8],
                        'priority': row[9],
                        'message': row[10],
                        'price_data_snapshot': row[11]
                    })

                return notifications
        except Exception as e:
            print(f"[DB ERROR] _get_notifications_from_db: {e}")
            return []

    def mark_notification_read(self, notification_id: int, user_id: str) -> bool:
        """Mark a single notification as read."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                connection.execute(text("""
                    UPDATE alert_notifications 
                    SET is_read = TRUE, read_at = NOW()
                    WHERE id = :id AND user_id = :user_id
                """), {'id': notification_id, 'user_id': user_id})
                connection.commit()
            return True
        except Exception as e:
            print(f"[ALERT ERROR] mark_notification_read: {e}")
            return False

    def mark_all_notifications_read(self, user_id: str) -> bool:
        """Mark all notifications for a user as read."""
        try:
            engine = get_data()
            with engine.connect() as connection:
                connection.execute(text("""
                    UPDATE alert_notifications 
                    SET is_read = TRUE, read_at = NOW()
                    WHERE user_id = :user_id AND is_read = FALSE
                """), {'user_id': user_id})
                connection.commit()

            notifications = self.redis.lrange(
                f"{REDIS_KEYS['notification_queue']}{user_id}",
                0, -1
            )
            self.redis.delete(f"{REDIS_KEYS['notification_queue']}{user_id}")
            for n in notifications:
                notif = json.loads(n)
                notif['is_read'] = True
                self.redis.rpush(
                    f"{REDIS_KEYS['notification_queue']}{user_id}",
                    json.dumps(notif)
                )

            return True
        except Exception as e:
            print(f"[ALERT ERROR] mark_all_notifications_read: {e}")
            return False

    def get_unread_count(self, user_id: str) -> int:
        """Return the number of unread notifications for a user."""
        try:
            notifications = self.redis.lrange(
                f"{REDIS_KEYS['notification_queue']}{user_id}",
                0, -1
            )
            count = sum(1 for n in notifications if not json.loads(n).get('is_read', False))

            if count == 0:
                engine = get_data()
                with engine.connect() as connection:
                    result = connection.execute(text("""
                        SELECT COUNT(*) FROM alert_notifications
                        WHERE user_id = :user_id AND is_read = FALSE
                    """), {'user_id': user_id})
                    count = result.fetchone()[0]

            return count
        except Exception as e:
            print(f"[ALERT ERROR] get_unread_count: {e}")
            return 0


# Global AlertService instance
alert_service = AlertService()


# =====================================================
# Utility Functions
# =====================================================

def get_alerts_for_symbol(symbol: str) -> List[Dict[str, Any]]:
    """Retrieve all active alerts for a symbol."""
    symbol = symbol.upper()
    alerts = []

    try:
        alert_ids = redis_client.smembers(f"{REDIS_KEYS['symbol_alerts']}{symbol}")

        for alert_id in alert_ids:
            alert_data = redis_client.get(f"{REDIS_KEYS['alert_data']}{alert_id}")
            if alert_data:
                alert = json.loads(alert_data)
                if alert.get('status') == 'active':
                    alerts.append(alert)

        return alerts
    except Exception as e:
        print(f"[ALERT ERROR] get_alerts_for_symbol: {e}")
        return []


def sync_redis_from_db():
    """Synchronize active alerts from PostgreSQL into Redis on startup."""
    try:
        engine = get_data()
        with engine.connect() as connection:
            result = connection.execute(text("""
                SELECT id, user_id, symbol, market_type, alert_type, target_value,
                       current_value_at_creation, priority, status, note, created_at,
                       triggered_at, triggered_value, expires_at, snooze_until,
                       is_recurring, trigger_count
                FROM alerts 
                WHERE status = 'active'
            """))

            count = 0
            for row in result:
                alert = {
                    'id': row[0],
                    'user_id': row[1],
                    'symbol': row[2],
                    'market_type': row[3],
                    'alert_type': row[4],
                    'target_value': float(row[5]) if row[5] else None,
                    'current_value_at_creation': float(row[6]) if row[6] else None,
                    'priority': row[7],
                    'status': row[8],
                    'note': row[9],
                    'created_at': row[10].isoformat() if row[10] else None,
                    'triggered_at': row[11].isoformat() if row[11] else None,
                    'triggered_value': float(row[12]) if row[12] else None,
                    'expires_at': row[13].isoformat() if row[13] else None,
                    'snooze_until': row[14].isoformat() if row[14] else None,
                    'is_recurring': row[15],
                    'trigger_count': row[16]
                }
                alert_service._cache_alert_to_redis(alert)
                count += 1

            print(f"[ALERT] Synced {count} active alerts from DB to Redis")
            return count

    except Exception as e:
        print(f"[ALERT ERROR] sync_redis_from_db: {e}")
        return 0
