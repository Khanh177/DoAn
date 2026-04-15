# backend/web/ml/gold_forecast.py

from pathlib import Path
from datetime import timedelta

import numpy as np
import pandas as pd
from keras.models import load_model
import joblib

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACT_DIR = BASE_DIR / "artifacts"

MODEL_PATH = ARTIFACT_DIR / "gold_lstm.h5"
SCALER_PATH = ARTIFACT_DIR / "gold_scaler.pkl"
DATA_PATH = ARTIFACT_DIR / "gold_history.parquet"

# ========== CẬP NHẬT: Thêm đầy đủ features ==========
feature_cols = [
    "Price", "SMA_5", "SMA_10", "EMA_12", "EMA_26", "MACD",
    "Price_Change", "Price_Change_3d", "Volatility",
    "Volatility_Ratio", "ROC", "ATR",
    "Momentum_3", "Momentum_7", "RSI", "BB_position"
]
window_size = 30

model = load_model(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)


def _calculate_rsi(data: pd.Series, window: int = 14) -> pd.Series:
    """Tính RSI (Relative Strength Index)"""
    delta = data.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=window, min_periods=1).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=window, min_periods=1).mean()
    rs = gain / loss
    return 100 - (100 / (1 + rs))


def _build_features(df: pd.DataFrame) -> pd.DataFrame:
    """Xây dựng tất cả features cho model"""
    df = df.copy()
    df["Date"] = pd.to_datetime(df["Date"])
    df.sort_values("Date", inplace=True)
    df.reset_index(drop=True, inplace=True)

    num_cols = df.columns.drop(["Date"])
    df[num_cols] = df[num_cols].replace({",": ""}, regex=True).astype("float64")

    # Moving Averages
    df["SMA_5"] = df["Price"].rolling(window=5).mean()
    df["SMA_10"] = df["Price"].rolling(window=10).mean()
    df["EMA_12"] = df["Price"].ewm(span=12, adjust=False).mean()
    df["EMA_26"] = df["Price"].ewm(span=26, adjust=False).mean()
    df["MACD"] = df["EMA_12"] - df["EMA_26"]

    # Price Changes & Volatility
    df["Price_Change"] = df["Price"].pct_change()
    df["Price_Change_3d"] = df["Price"].pct_change(periods=3)
    df["Volatility"] = df["Price"].rolling(window=10).std()
    df["Volatility_Ratio"] = (
        df["Volatility"] / df["Volatility"].rolling(window=30).mean()
    )

    # ROC
    df["ROC"] = (
        (df["Price"] - df["Price"].shift(10)) / df["Price"].shift(10)
    ) * 100

    # ATR
    df["H-L"] = df["High"] - df["Low"]
    df["H-PC"] = (df["High"] - df["Price"].shift(1)).abs()
    df["L-PC"] = (df["Low"] - df["Price"].shift(1)).abs()
    df["TR"] = df[["H-L", "H-PC", "L-PC"]].max(axis=1)
    df["ATR"] = df["TR"].rolling(window=14).mean()

    # ========== THÊM MỚI: Momentum, RSI, Bollinger Bands ==========
    df["Momentum_3"] = df["Price"] - df["Price"].shift(3)
    df["Momentum_7"] = df["Price"] - df["Price"].shift(7)
    
    df["RSI"] = _calculate_rsi(df["Price"])

    df["BB_middle"] = df["Price"].rolling(window=20).mean()
    df["BB_std"] = df["Price"].rolling(window=20).std()
    df["BB_upper"] = df["BB_middle"] + (df["BB_std"] * 2)
    df["BB_lower"] = df["BB_middle"] - (df["BB_std"] * 2)
    df["BB_position"] = (df["Price"] - df["BB_lower"]) / (
        df["BB_upper"] - df["BB_lower"]
    )

    df.dropna(inplace=True)
    df.reset_index(drop=True, inplace=True)
    return df


def _load_history() -> pd.DataFrame:
    """Load dữ liệu lịch sử"""
    df = pd.read_parquet(DATA_PATH)
    return df


def forecast_gold(days: int):
    """
    Dự đoán giá vàng cho `days` ngày tới
    
    Args:
        days: Số ngày cần dự đoán (khuyến nghị 3-7 ngày)
    
    Returns:
        Dictionary chứa:
        - today_price: Giá vàng hôm nay
        - today_date: Ngày hiện tại
        - items: List các dự đoán [{date, price, change_pct}, ...]
        - max_price, min_price, range: Thống kê
        - history: Dữ liệu lịch sử 30 ngày gần nhất
    """
    df_raw = _load_history()
    df = _build_features(df_raw)

    # Lấy 30 ngày gần nhất để vẽ biểu đồ lịch sử
    history_tail = df.tail(window_size)
    history = [
        {
            "date": row.Date.date().isoformat(),
            "price": float(row.Price),
            "change_pct": 0.0,
        }
        for row in history_tail.itertuples()
    ]

    last_prices = df[["Price", "High", "Low"]].iloc[-window_size:].copy()
    predicted_prices = []

    last_date = df["Date"].iloc[-1]
    today_price = df["Price"].iloc[-1]

    for _ in range(days):
        temp_df = last_prices.copy()

        # ========== TÍNH TẤT CẢ FEATURES ==========
        temp_df["SMA_5"] = temp_df["Price"].rolling(window=5, min_periods=1).mean()
        temp_df["SMA_10"] = temp_df["Price"].rolling(window=10, min_periods=1).mean()
        temp_df["EMA_12"] = temp_df["Price"].ewm(span=12, adjust=False, min_periods=1).mean()
        temp_df["EMA_26"] = temp_df["Price"].ewm(span=26, adjust=False, min_periods=1).mean()
        temp_df["MACD"] = temp_df["EMA_12"] - temp_df["EMA_26"]

        temp_df["Price_Change"] = temp_df["Price"].pct_change()
        temp_df["Price_Change_3d"] = temp_df["Price"].pct_change(periods=3)
        temp_df["Volatility"] = temp_df["Price"].rolling(window=10, min_periods=1).std()
        temp_df["Volatility_Ratio"] = (
            temp_df["Volatility"]
            / temp_df["Volatility"].rolling(window=min(30, len(temp_df)), min_periods=1).mean()
        )

        temp_df["ROC"] = (
            (temp_df["Price"] - temp_df["Price"].shift(10))
            / temp_df["Price"].shift(10)
        ) * 100

        temp_df["H-L"] = temp_df["High"] - temp_df["Low"]
        temp_df["H-PC"] = (temp_df["High"] - temp_df["Price"].shift(1)).abs()
        temp_df["L-PC"] = (temp_df["Low"] - temp_df["Price"].shift(1)).abs()
        temp_df["TR"] = temp_df[["H-L", "H-PC", "L-PC"]].max(axis=1)
        temp_df["ATR"] = temp_df["TR"].rolling(window=14, min_periods=1).mean()

        # ========== CÁC FEATURES MỚI ==========
        temp_df["Momentum_3"] = temp_df["Price"] - temp_df["Price"].shift(3)
        temp_df["Momentum_7"] = temp_df["Price"] - temp_df["Price"].shift(7)
        
        temp_df["RSI"] = _calculate_rsi(temp_df["Price"])

        temp_df["BB_middle"] = temp_df["Price"].rolling(window=20, min_periods=1).mean()
        temp_df["BB_std"] = temp_df["Price"].rolling(window=20, min_periods=1).std()
        temp_df["BB_upper"] = temp_df["BB_middle"] + (temp_df["BB_std"] * 2)
        temp_df["BB_lower"] = temp_df["BB_middle"] - (temp_df["BB_std"] * 2)
        temp_df["BB_position"] = (temp_df["Price"] - temp_df["BB_lower"]) / (
            temp_df["BB_upper"] - temp_df["BB_lower"]
        )

        # Lấy features cuối cùng
        feature_values = temp_df[feature_cols].iloc[-window_size:]
        
        # ========== SỬA LỖI: Dùng ffill/bfill thay vì method='bfill' ==========
        feature_values = feature_values.ffill().bfill().fillna(0)

        # Scale và dự đoán
        scaled_features = scaler.transform(feature_values)
        X_forecast = scaled_features.reshape(1, window_size, len(feature_cols))

        predicted_scaled = model.predict(X_forecast, verbose=0)
        predicted_full = np.concatenate(
            [predicted_scaled, np.zeros((1, len(feature_cols) - 1))],
            axis=1,
        )
        predicted_price = scaler.inverse_transform(predicted_full)[0, 0]

        predicted_prices.append(predicted_price)

        # ========== CẢI THIỆN: Ước tính High/Low dựa trên volatility ==========
        recent_volatility = temp_df["Volatility"].iloc[-1]
        if pd.isna(recent_volatility) or recent_volatility == 0:
            recent_volatility = temp_df["Price"].iloc[-10:].std()
        
        estimated_high = predicted_price + recent_volatility
        estimated_low = predicted_price - recent_volatility

        new_row = pd.DataFrame(
            {
                "Price": [predicted_price],
                "High": [estimated_high],
                "Low": [estimated_low],
            }
        )
        last_prices = pd.concat(
            [last_prices.iloc[1:], new_row], ignore_index=True
        )

    # Tạo kết quả trả về
    items = []
    for i, price in enumerate(predicted_prices):
        date = (last_date + timedelta(days=i + 1)).date().isoformat()
        change_pct = (price - today_price) / today_price * 100
        items.append(
            {
                "date": date,
                "price": float(price),
                "change_pct": float(change_pct),
            }
        )

    return {
        "today_price": float(today_price),
        "today_date": last_date.date().isoformat(),
        "items": items,
        "max_price": float(max(predicted_prices)),
        "min_price": float(min(predicted_prices)),
        "range": float(max(predicted_prices) - min(predicted_prices)),
        "avg_price": float(np.mean(predicted_prices)),
        "history": history,
    }