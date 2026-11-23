from __future__ import annotations

import hashlib
from pathlib import Path

import tensorrt as trt

from .onnx import OnnxBackend

_LOGGER = trt.Logger(trt.Logger.WARNING)


class TensorRTBackend(OnnxBackend):
    """Runs the ONNX graph through onnxruntime's TensorRT execution provider, caching engines on disk."""

    name = "tensorrt"

    def __init__(self, model: dict, runtime: dict) -> None:
        opts = runtime.get("tensorrt", {})
        cache = Path(opts.get("engine_cache", "/tmp/trt-engines"))
        cache.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha256(f"{model['name']}:{trt.__version__}:{opts.get('precision')}".encode()).hexdigest()[:16]
        self.engine_path = cache / f"{key}.engine"
        runtime = {**runtime, "providers": [("TensorrtExecutionProvider", {
            "trt_fp16_enable": opts.get("precision") == "fp16",
            "trt_engine_cache_enable": True,
            "trt_engine_cache_path": str(cache),
        })]}
        super().__init__(model, runtime)
