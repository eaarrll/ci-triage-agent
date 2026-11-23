from __future__ import annotations

import argparse
from pathlib import Path

import uvicorn
import yaml
from fastapi import FastAPI, UploadFile

from .export import load_backend


def build_app(config: dict) -> FastAPI:
    app = FastAPI(title="vision-serve")
    backend = load_backend(config["model"], config["runtime"])

    @app.get("/healthz")
    def healthz() -> dict:
        return {"ok": True, "backend": backend.name}

    @app.post("/v1/detect")
    async def detect(image: UploadFile) -> dict:
        return {"detections": backend.detect(await image.read())}

    return app


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--device", default=None)
    args = parser.parse_args()
    config = yaml.safe_load(args.config.read_text())
    if args.device:
        config["runtime"]["device"] = args.device
    server = config["server"]
    uvicorn.run(build_app(config), host=server["host"], port=server["port"], workers=server["workers"])
