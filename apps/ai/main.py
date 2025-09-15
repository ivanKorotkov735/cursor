from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import hashlib

app = FastAPI(title="AI Verification Service", version="0.0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VerificationResult(BaseModel):
    model_version: str
    score_human: float
    verdict: str
    explanations: list[str] | None = None


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/verify", response_model=VerificationResult)
async def verify(file: UploadFile = File(...)):
    # Placeholder heuristic: deterministic pseudo-score from file bytes
    data = await file.read()
    h = hashlib.sha256(data).digest()
    # map first two bytes to [0,1]
    score_human = (h[0] * 256 + h[1]) / 65535.0

    # thresholds: <0.3 -> block, 0.3..0.6 -> review, >0.6 -> pass
    if score_human < 0.30:
        verdict = "block"
    elif score_human < 0.60:
        verdict = "review"
    else:
        verdict = "pass"

    return VerificationResult(
        model_version="baseline-0.0.1",
        score_human=float(score_human),
        verdict=verdict,
        explanations=["Deterministic placeholder score for prototype"],
    )

