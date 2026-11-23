import os
import pathlib
import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from dotenv import load_dotenv

project_root = pathlib.Path(__file__).parent.parent
load_dotenv(dotenv_path=project_root / ".env")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "fintechrssdb")


def create_database() -> bool:
    print(f"Connecting to PostgreSQL at {DB_HOST}:{DB_PORT} as {DB_USER}...")
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname="postgres"
        )
        conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
        cursor = conn.cursor()

        cursor.execute("SELECT 1 FROM pg_catalog.pg_database WHERE datname = %s", (DB_NAME,))
        exists = cursor.fetchone()

        if not exists:
            print(f"Creating database '{DB_NAME}'...")
            cursor.execute(f'CREATE DATABASE "{DB_NAME}"')
            print(f"Database '{DB_NAME}' created successfully.")
        else:
            print(f"Database '{DB_NAME}' already exists.")

        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Warning: Could not verify/create database '{DB_NAME}' via 'postgres' db: {e}")
        return True


def migrate_db() -> bool:
    print(f"Applying PostgreSQL schema to '{DB_NAME}' on {DB_HOST}:{DB_PORT}...")
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME
        )
        conn.autocommit = True
        cursor = conn.cursor()

        schema_path = pathlib.Path(__file__).parent / "schema_postgres.sql"
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_sql = f.read()

        cursor.execute(schema_sql)
        print("Schema creation completed successfully.")

        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"Migration failed: {e}")
        return False


if __name__ == "__main__":
    if not all([DB_HOST, DB_USER, DB_PASSWORD]):
        print("Error: DB_HOST, DB_USER, and DB_PASSWORD must be set in .env")
    else:
        create_database()
        migrate_db()
