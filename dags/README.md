# SiteLens Airflow DAG

`sitelens_etl.py` orchestrates the OSM pipeline: **extract → (freshness branch) load →
data-quality gate → H3 aggregation → tile-matview refresh → report.**

```
extract ──▶ freshness_gate ──▶ load_osm ──┐
                └───────────▶ skip_load ──┴──▶ validate ──▶ transform_h3 ──▶ report
                                                   └───────▶ refresh_matviews ──▶ report
```

- **Freshness-aware:** the `.pbf` is hashed each run; unchanged source skips the import.
- **Idempotent:** re-runs are safe — import recreates tables, H3 is drop-and-recreate,
  matviews are refreshed in place.
- **Quality gate:** row-count floors, `ST_IsValid` sample, SRID check. Failure stops
  the run before any derived artifact is touched.

## Run it (WSL Ubuntu)

One-time setup:

```bash
python3 -m venv ~/airflow-venv
~/airflow-venv/bin/pip install 'apache-airflow==2.10.4' 'psycopg[binary]' h3 \
  --constraint 'https://raw.githubusercontent.com/apache/airflow/constraints-2.10.4/constraints-3.12.txt'
```

Every run (RDS through the SSM tunnel — start `.\scripts\db-tunnel.ps1 -TunnelOnly`
on Windows first):

```bash
export AIRFLOW_HOME=~/airflow
export AIRFLOW__CORE__DAGS_FOLDER=/mnt/d/demo/sitelens/dags
export SITELENS_DB_HOST=$(ip route | awk '/default/ {print $3}')   # Windows host from WSL
export SITELENS_DB_PASS='<the RDS password>'
~/airflow-venv/bin/airflow dags test sitelens_etl 2026-09-26
```

`dags test` executes the whole DAG in-process — no scheduler or webserver needed.
For the UI (graph view, run history): `~/airflow-venv/bin/airflow standalone`,
then open http://localhost:8080.

Config knobs (env): `SITELENS_PBF`, `SITELENS_MIN_POINTS/LINES/POLYGONS`
(quality-gate floors — raise for the full TN import), `SITELENS_H3_RES`,
`SITELENS_DB_*` (host/port/name/user/pass/sslmode).
