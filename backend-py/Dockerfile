# Local-run image for the SiteLens Python backend.
# (Deploys to Lambda go via SAM; this Dockerfile is for `docker compose` local dev.)
# Runs the same FastAPI app with uvicorn instead of the Mangum/Lambda handler.
FROM python:3.12-slim

WORKDIR /app

# psycopg[binary] and bcrypt ship manylinux wheels — no compiler needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "uvicorn[standard]==0.34.0"

COPY app ./app

EXPOSE 8080
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
