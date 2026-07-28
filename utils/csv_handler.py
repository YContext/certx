import pandas as pd
from pathlib import Path


def read_names(csv_path: Path):
    """Read CSV and return (DataFrame, name_column).

    Attempts to auto-detect a column name containing 'name'. Falls back to the first column.
    """
    df = pd.read_csv(csv_path)
    if df.empty:
        raise ValueError('CSV is empty')

    name_cols = [c for c in df.columns if 'name' in str(c).lower()]
    if name_cols:
        return df, name_cols[0]
    return df, df.columns[0]
