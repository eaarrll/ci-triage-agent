# vision-models

Detection models and the `vision-serve` HTTP inference server.

Two images are built from `docker/`:

| Variant | Base                                  | Used by                    |
| ------- | ------------------------------------- | -------------------------- |
| `cpu`   | `python:3.12-slim`                    | local dev, CI smoke tests  |
| `cuda`  | `nvidia/cuda:12.6.3-cudnn-*-ubuntu24.04` | GPU node pool (L4 / A10G) |

```sh
docker build -f docker/cuda.Dockerfile -t vision-models:cuda .
docker run --gpus all -p 8000:8000 vision-models:cuda
```
