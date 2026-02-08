from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import joblib
from pathlib import Path
from datetime import datetime

# ----------------------------
# Paths
# ----------------------------
BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "colombo_aqi_dataset.csv"
PIPE_PATH = BASE_DIR / "aqi_pipeline.pkl"

# Try both names (because your file is "label_encoders" without .pkl)
ENC_PATH_1 = BASE_DIR / "label_encoders.pkl"
ENC_PATH_2 = BASE_DIR / "label_encoders"

# ----------------------------
# Load files
# ----------------------------
try:
    df = pd.read_csv(DATA_PATH).drop_duplicates()
except Exception as e:
    df = None
    print("❌ Dataset load error:", e)

try:
    pipe = joblib.load(PIPE_PATH)
except Exception as e:
    pipe = None
    print("❌ Pipeline load error:", e)

encoders = None
try:
    if ENC_PATH_1.exists():
        encoders = joblib.load(ENC_PATH_1)
    elif ENC_PATH_2.exists():
        encoders = joblib.load(ENC_PATH_2)
except Exception as e:
    encoders = None
    print("❌ Encoders load error:", e)

# ----------------------------
# App
# ----------------------------
app = FastAPI(title="Colombo AQI Predictor API")

# ✅ CORS (React)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# Coords for map
# ----------------------------
LOCATION_COORDS = {
    "Colombo City": (6.9271, 79.8612),
    "Dehiwala-Mount Lavinia": (6.8347, 79.8661),
    "Moratuwa": (6.7730, 79.8816),
    "Maharagama": (6.8480, 79.9267),
    "Kotte (Sri Jayawardenepura Kotte)": (6.9022, 79.9090),
    "Kolonnawa": (6.9320, 79.8890),
    "Homagama": (6.8440, 80.0020),
    "Malabe": (6.9136, 79.9700),
    "Athurugiriya": (6.8746, 79.9987),
    "Battaramulla": (6.9003, 79.9181),
    "Rajagiriya": (6.9092, 79.8948),
    "Kottawa": (6.8410, 79.9650),
    "Nugegoda": (6.8697, 79.8880),
    "Kaduwela": (6.9346, 79.9846),
    "Pannipitiya": (6.8470, 79.9440),
    "Talawatugoda": (6.8775, 79.9324),
    "Kotikawatta": (6.9870, 79.9220),
    "Piliyandala": (6.8018, 79.9224),
    "Boralesgamuwa": (6.8405, 79.9017),
    "Kesbewa": (6.7980, 79.9400),
    "Wellampitiya": (6.9395, 79.8956),
    "Mulleriyawa": (6.9520, 79.9540),
    "Angoda": (6.9320, 79.9690),
    "Hanwella": (6.9070, 80.0820),
    "Avissawella": (6.9547, 80.2040),
    "Horana": (6.7146, 80.0623),
    "Padukka": (6.8450, 80.0900),
    "Mahara": (7.0000, 79.9400),
    "Kelaniya": (6.9553, 79.9220),
    "Peliyagoda": (6.9616, 79.8826),
    "Nawala": (6.8890, 79.8890),
    "Godagama": (6.8300, 80.0200),
    "Koswatta": (6.9140, 79.9050),
    "Madiwela": (6.8915, 79.9000),
    "Hokandara": (6.8900, 79.9600),
}

# ----------------------------
# Helpers
# ----------------------------
def aqi_category(aqi: float) -> str:
    if aqi <= 50: return "Good"
    if aqi <= 100: return "Moderate"
    if aqi <= 150: return "Unhealthy for Sensitive Groups"
    if aqi <= 200: return "Unhealthy"
    if aqi <= 300: return "Very Unhealthy"
    return "Hazardous"

def advice_for(aqi: float):
    if aqi <= 100:
        return ["Outdoor activities are generally safe."]
    if aqi <= 150:
        return ["Sensitive groups should reduce long outdoor exposure."]
    if aqi <= 200:
        return ["Wear a mask outdoors.", "Reduce outdoor activities."]
    if aqi <= 300:
        return ["Avoid outdoor activities.", "Wear N95 if you must go out."]
    return ["Hazardous: Stay indoors.", "Avoid outdoor activities completely."]

# ----------------------------
# API Models
# ----------------------------
class PredictRequest(BaseModel):
    location: str
    date: str   # YYYY-MM-DD
    hour: int   # 0-23

# ----------------------------
# Endpoints
# ----------------------------
@app.get("/")
def root():
    return {"status": "ok", "message": "Colombo AQI API running"}

@app.get("/locations")
def get_locations():
    if df is None:
        raise HTTPException(status_code=500, detail="Dataset not loaded.")
    return {"locations": sorted(df["Location"].dropna().unique().tolist())}

@app.get("/location-coords/{location}")
def get_location_coords(location: str):
    lat, lng = LOCATION_COORDS.get(location, (6.9271, 79.8612))
    return {"location": location, "lat": lat, "lng": lng}

@app.post("/predict")
def predict(req: PredictRequest):
    if df is None:
        raise HTTPException(status_code=500, detail="Dataset not loaded.")
    if pipe is None:
        raise HTTPException(status_code=500, detail="Pipeline not loaded.")
    if encoders is None:
        raise HTTPException(status_code=500, detail="Label encoders not loaded. (label_encoders.pkl missing?)")

    if not (0 <= req.hour <= 23):
        raise HTTPException(status_code=400, detail="Hour must be 0–23.")
    if req.location not in df["Location"].values:
        raise HTTPException(status_code=400, detail="Unknown location.")

    # ✅ Build a base row from dataset (so all columns exist)
    base_row = df[df["Location"] == req.location].iloc[0].to_dict()

    # ✅ Override date/time fields
    dt = datetime.strptime(req.date, "%Y-%m-%d")
    base_row["Year"] = dt.year
    base_row["Month"] = dt.month
    base_row["Day"] = dt.day
    base_row["Hour"] = req.hour
    base_row["Location"] = req.location
    base_row["Day_of_Week"] = dt.strftime("%A")  # Monday..Sunday

    # Remove target if exists
    base_row.pop("AQI_US", None)

    # ✅ Make X in EXACT training column order (same as: X = df.drop("AQI_US", axis=1))
    feature_cols = [c for c in df.columns if c != "AQI_US"]
    X = pd.DataFrame([base_row]).reindex(columns=feature_cols)

    # ✅ Apply LabelEncoders to categorical columns (same as notebook)
    for col, le in encoders.items():
        if col in X.columns:
            val = str(X.at[0, col])

            # unseen value protection
            if val not in le.classes_:
                # fallback -> most common value from dataset
                fallback = df[col].mode().iloc[0]
                val = str(fallback)

            X[col] = le.transform([val])

    # ✅ Now X is numeric -> pipeline predict works
    pred = float(pipe.predict(X)[0])

    return {
        "selected_location": req.location,
        "predicted_aqi": round(pred, 2),
        "category": aqi_category(pred),
        "advice": advice_for(pred),
    }
