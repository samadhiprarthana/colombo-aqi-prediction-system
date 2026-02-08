import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import { FaRegCalendarAlt } from "react-icons/fa";

import L from "leaflet";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const API_BASE = "http://localhost:8000";



const badgeClass = (cat) => {
  const c = (cat || "").toLowerCase();
  if (c.includes("good")) return "badge good";
  if (c.includes("moderate")) return "badge moderate";
  if (c.includes("sensitive")) return "badge sensitive";
  if (c.includes("unhealthy") && !c.includes("very")) return "badge unhealthy";
  if (c.includes("very")) return "badge very";
  return "badge hazardous";
};

const aqiPercent = (aqi) => {
  const max = 380;
  const v = Math.max(0, Math.min(max, Number(aqi || 0)));
  return Math.round((v / max) * 100);
};

const to24Hour = (hh, ampm) => {
  let h = parseInt(hh, 10);
  if (Number.isNaN(h)) return null;
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h;
};

const prettyDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
};

function FlyTo({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 12.8, { duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function App() {
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState("");

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [hour12, setHour12] = useState(8);
  const [ampm, setAmpm] = useState("AM");

  const [markerPos, setMarkerPos] = useState([6.9271, 79.8612]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    axios
      .get(`${API_BASE}/locations`)
      .then((res) => {
        const list = res.data.locations || [];
        setLocations(list);
        if (list.length > 0) setLocation(list[0]);
      })
      .catch(() => setError("Cannot load locations. Check backend is running on port 8000."));
  }, []);

  useEffect(() => {
    if (!location) return;
    axios
      .get(`${API_BASE}/location-coords/${encodeURIComponent(location)}`)
      .then((res) => {
        const { lat, lng } = res.data;
        if (lat && lng) setMarkerPos([lat, lng]);
      })
      .catch(() => {});
  }, [location]);

  const canPredict = useMemo(() => {
    const hh = parseInt(hour12, 10);
    return location && date && !Number.isNaN(hh) && hh >= 1 && hh <= 12;
  }, [location, date, hour12]);

  const predict = async () => {
    setError("");
    setResult(null);

    const hh = parseInt(hour12, 10);
    if (!location || !date || Number.isNaN(hh) || hh < 1 || hh > 12) {
      setError("Please select location + date + valid time (1–12) with AM/PM.");
      return;
    }

    const hour24 = to24Hour(hh, ampm);
    if (hour24 === null) {
      setError("Invalid time. Please enter hour 1–12.");
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${API_BASE}/predict`, {
        location,
        date,
        hour: hour24,
      });

      setResult({
        ...res.data,
        _inputMeta: { date, hour12: hh, ampm, hour24 },
      });
    } catch (e) {
      const msg =
        e?.response?.data?.detail ||
        "Network error. Check backend: python -m uvicorn main:app --reload --port 8000";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="heroInner">
          <div className="brandRow">
            <div className="brandIcon">🌬️</div>
            <div>
              <h1 className="title">Colombo AQI Predictor</h1>
              <p className="subtitle">
                Select a Colombo location, choose date & time, and predict AQI with health guidance.
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="wrap">
        <div className="grid">
          <section className="card">
            <div className="cardHeader">
              <h2>Inputs</h2>
              <span className="chip">Prediction</span>
            </div>

            <div className="form">
            
             <div className="field">
                <label>Location (Colombo District)</label>
                <select value={location} onChange={(e) => setLocation(e.target.value)}>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>

            <div className="field">
  <label>Date</label>

  <div className="dateWrap">
    <input
      type="date"
      value={date}
      onChange={(e) => setDate(e.target.value)}
      className="dateInput"
    />

    <button
      type="button"
      className="dateBtn"
      onClick={() => document.querySelector(".dateInput")?.showPicker?.()}
      aria-label="Open calendar"
      title="Open calendar"
    >
      <FaRegCalendarAlt />
    </button>
  </div>
            </div>


              
              <div className="field">
                <label>Time</label>
                <div className="timeRow">
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={hour12}
                    onChange={(e) => setHour12(e.target.value)}
                    placeholder="1-12"
                  />
                  <select value={ampm} onChange={(e) => setAmpm(e.target.value)}>
                    <option value="AM">AM</option>
                    <option value="PM">PM</option>
                  </select>
                </div>
                <div className="helper">Backend uses 24-hour format automatically (0–23).</div>
              </div>

              <button className="btn" onClick={predict} disabled={loading || !canPredict}>
                {loading ? "Predicting..." : "Predict AQI"}
              </button>

              {error && <div className="alert error">{error}</div>}
            </div>

            <div className="divider" />

            <div className="result">
              <div className="resultHeader">
                <h2>Result</h2>
                {result?.category ? (
                  <span className={badgeClass(result.category)}>{result.category}</span>
                ) : (
                  <span className="badge ghost">No result</span>
                )}
              </div>

              {!result && (
                <div className="empty">
                  <div className="emptyIcon">📊</div>
                  <div>
                    <div className="emptyTitle">Run prediction to see results</div>
                    <div className="emptyText">Choose location + date + time then click Predict.</div>
                  </div>
                </div>
              )}

              {result && (
                <>
                  <div className="aqiBigRow">
                    <div>
                      <div className="aqiLabel">Predicted AQI</div>
                      <div className="aqiValue">{result.predicted_aqi}</div>
                      <div className="metaLine">
                        <span className="metaPill">📍 {result.selected_location}</span>
                        <span className="metaPill">📅 {prettyDate(result._inputMeta?.date)}</span>
                        <span className="metaPill">
                          🕒 {result._inputMeta?.hour12} {result._inputMeta?.ampm}
                        </span>
                      </div>
                    </div>

                    <div className="aqiMini">
                      <div className="miniTitle">AQI Scale</div>
                      <div className="scaleBar">
                        <div className="scaleFill" style={{ width: `${aqiPercent(result.predicted_aqi)}%` }} />
                      </div>
                      <div className="scaleLabels">
                        <span>0</span>
                        <span>380</span>
                      </div>
                    </div>
                  </div>

                  <div className="adviceBox">
                    <div className="adviceTitle">Health guidance</div>
                    <ul>
                      {(result.advice || []).map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="card mapCard">
            <div className="cardHeader">
              <h2>Map (Colombo)</h2>
              <span className="chip">Leaflet</span>
            </div>

            <p className="muted">Marker updates automatically when you select a location.</p>

            <div className="mapWrap">
              <MapContainer center={markerPos} zoom={12} style={{ height: "100%", width: "100%" }}>
                <FlyTo center={markerPos} />
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={markerPos}>
                  <Popup>
                    <b>{location}</b>
                    <br />
                    Colombo District
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
