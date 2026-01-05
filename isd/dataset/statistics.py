"""
Utilities to calculate and cache dataset-level statistics that power the
Predictor dataset tab.
"""

from __future__ import annotations

import logging
import warnings
from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np
import pandas as pd
from django.db import transaction, DatabaseError

from .file_utils import FileStorageManager
from .models import Dataset, DatasetStatistics

logger = logging.getLogger(__name__)

DATASET_STATS_SCHEMA_VERSION = "v2"
MIN_HISTOGRAM_BINS = 5
MAX_HISTOGRAM_BINS = 20


@dataclass
class DatasetStatisticsResult:
    """Lightweight wrapper returned after computing dataset statistics."""

    stats: DatasetStatistics
    dataframe: Optional[pd.DataFrame]


def ensure_dataset_statistics(
    dataset: Dataset,
    *,
    force_recalculate: bool = False,
    dataframe: Optional[pd.DataFrame] = None,
    include_dataframe: bool = False,
) -> DatasetStatisticsResult:
    """
    Fetch cached statistics for a dataset, computing them if necessary.

    Args:
        dataset: Dataset instance to analyse.
        force_recalculate: When True, recompute statistics even if cached.
        dataframe: Optional pre-loaded dataframe that represents the dataset.

    Returns:
        DatasetStatisticsResult: Cached or freshly computed stats and the dataframe used.
    """
    try:
        existing = dataset.statistics
    except DatasetStatistics.DoesNotExist:
        existing = None
    except DatabaseError:
        raise

    if (
        existing
        and not force_recalculate
        and existing.schema_version == DATASET_STATS_SCHEMA_VERSION
    ):
        df: Optional[pd.DataFrame] = dataframe
        if df is None and include_dataframe:
            df = _read_dataset_into_dataframe(dataset)
        return DatasetStatisticsResult(stats=existing, dataframe=df)

    return calculate_and_store_dataset_statistics(dataset, dataframe=dataframe)


def calculate_and_store_dataset_statistics(
    dataset: Dataset,
    *,
    dataframe: Optional[pd.DataFrame] = None,
) -> DatasetStatisticsResult:
    """
    Calculate dataset statistics and persist them to ``DatasetStatistics``.

    Args:
        dataset: Dataset instance to analyse.
        dataframe: Optional pre-loaded dataframe (avoids re-reading disk).

    Returns:
        DatasetStatistics: The saved statistics instance.
    """
    df = dataframe if dataframe is not None else _read_dataset_into_dataframe(dataset)

    if df is None or df.empty:
        logger.warning(
            "Dataset %s has no data – storing empty statistics", dataset.dataset_id
        )
        general_stats = {
            "num_samples": 0,
            "num_features": 0,
            "num_numeric_features": 0,
            "num_censored": None,
            "num_events": None,
            "time_min": None,
            "time_max": None,
            "time_mean": None,
            "time_median": None,
            "time_unit": dataset.time_unit,
            "total_columns": 0,
        }
        feature_correlations: list[dict[str, float | str]] = []
        event_time_histogram: list[dict[str, float | int]] = []
    else:
        analysis = _compute_statistics_from_dataframe(df, dataset.time_unit)
        general_stats = analysis["general_stats"]
        feature_correlations = analysis["feature_correlations"]
        event_time_histogram = analysis["event_time_histogram"]

    with transaction.atomic():
        stats, _ = DatasetStatistics.objects.update_or_create(
            dataset=dataset,
            defaults={
                "general_stats": general_stats,
                "feature_correlations": feature_correlations,
                "event_time_histogram": event_time_histogram,
                "schema_version": DATASET_STATS_SCHEMA_VERSION,
            },
        )

    return DatasetStatisticsResult(stats=stats, dataframe=df if df is not None else pd.DataFrame())


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _read_dataset_into_dataframe(dataset: Dataset) -> Optional[pd.DataFrame]:
    """Load the dataset file into a dataframe."""
    if not dataset.file_path:
        logger.warning("Dataset %s has no file path – cannot compute stats", dataset.pk)
        return None

    storage = FileStorageManager()
    file_path = storage.get_full_path(dataset.file_path)

    try:
        if not storage.file_exists(dataset.file_path):
            logger.warning(
                "Dataset %s file %s is missing; skipping statistics generation.",
                dataset.pk,
                dataset.file_path,
            )
            return None

        if dataset.file_path.lower().endswith(".tsv"):
            return pd.read_csv(file_path, sep="\t")
        return pd.read_csv(file_path)
    except FileNotFoundError:
        logger.warning(
            "Dataset %s file %s not found on disk; skipping statistics generation.",
            dataset.pk,
            dataset.file_path,
        )
        return None
    except Exception as exc:
        logger.error(
            "Failed to read dataset %s for statistics: %s", dataset.pk, exc, exc_info=True
        )
        return None


def _compute_statistics_from_dataframe(
    df: pd.DataFrame, time_unit: str
) -> dict[str, object]:
    """
    Compute statistics we care about from the dataframe representation.

    The first two columns are assumed to represent survival time and the censor flag,
    but we fall back gracefully if explicit columns such as ``time``/``censored`` exist.
    """
    df = df.copy()

    time_col = _find_column(df, ["time", "Time", "TIME", "duration", "survival_time"])
    censor_col = _find_column(
        df,
        ["censored", "Censored", "event", "Event", "status", "Status", "failure"],
        exclude={time_col} if time_col else None,
    )

    if time_col is None and not df.empty:
        time_col = df.columns[0]
    if censor_col is None and len(df.columns) > 1:
        fallback_candidates = [
            col for col in df.columns[1:] if col != time_col
        ]
        if fallback_candidates:
            censor_col = fallback_candidates[0]

    # General stats ---------------------------------------------------------
    num_rows, num_cols = df.shape
    feature_columns = df.columns.tolist()[2:] if num_cols >= 2 else []

    numeric_features_df = df[feature_columns].select_dtypes(include=[np.number])

    general_stats = {
        "num_samples": int(num_rows),
        "num_features": int(len(feature_columns)),
        "num_numeric_features": int(numeric_features_df.shape[1])
        if not numeric_features_df.empty
        else 0,
        "num_censored": None,
        "num_events": None,
        "time_min": None,
        "time_max": None,
        "time_mean": None,
        "time_median": None,
        "time_unit": time_unit,
        "total_columns": int(num_cols),
    }

    time_series = None
    time_numeric = None
    if time_col and time_col in df.columns:
        time_numeric = pd.to_numeric(df[time_col], errors="coerce")
        time_series = time_numeric.dropna()
        if not time_series.empty:
            general_stats.update(
                {
                    "time_min": float(time_series.min()),
                    "time_max": float(time_series.max()),
                    "time_mean": float(time_series.mean()),
                    "time_median": float(time_series.median()),
                }
            )

    event_indicator = None
    if censor_col and censor_col in df.columns:
        event_indicator = _derive_event_indicator(df[censor_col], censor_col)

    if event_indicator is not None:
        event_indicator = event_indicator.reindex(df.index).fillna(0).astype(int)
        general_stats.update(
            {
                "num_events": int((event_indicator == 1).sum()),
                "num_censored": int((event_indicator == 0).sum()),
            }
        )
    else:
        event_indicator = pd.Series(1, index=df.index, name="event", dtype=int)

    # Feature correlations --------------------------------------------------
    feature_correlations = _compute_feature_statistics(
        df,
        feature_columns,
        time_col,
        event_indicator,
        time_numeric,
    )

    # Event time histogram --------------------------------------------------
    event_time_histogram = _build_event_time_histogram(time_numeric, event_indicator)

    return {
        "general_stats": general_stats,
        "feature_correlations": feature_correlations,
        "event_time_histogram": event_time_histogram,
    }


def _find_column(
    df: pd.DataFrame,
    candidates: Iterable[str],
    exclude: Optional[set[str]] = None,
) -> Optional[str]:
    """Return the first column present in ``candidates`` while respecting exclusions."""
    exclude = exclude or set()
    for name in candidates:
        if name in exclude:
            continue
        if name in df.columns:
            return name
    return None


def _determine_histogram_bin_count(sample_count: int) -> int:
    """Select a reasonable number of bins for histogram representation."""
    if sample_count <= 0:
        return MIN_HISTOGRAM_BINS

    heuristic = int(np.sqrt(sample_count))
    heuristic = max(MIN_HISTOGRAM_BINS, heuristic)
    heuristic = min(MAX_HISTOGRAM_BINS, heuristic)
    return heuristic


def _derive_event_indicator(series: pd.Series, column_name: str) -> Optional[pd.Series]:
    """Infer an event indicator series (1 = event observed, 0 = censored)."""
    numeric = pd.to_numeric(series, errors="coerce")
    valid = numeric.dropna()
    if valid.empty:
        return None

    unique_values = set(valid.unique())
    if not unique_values.issubset({0, 1}):
        return None

    column_name_lower = column_name.lower()
    if "censor" in column_name_lower:
        indicator = 1 - numeric
    else:
        indicator = numeric

    indicator = indicator.astype(float)
    indicator.name = "event_indicator"
    return indicator


def _build_event_time_histogram(
    time_numeric: Optional[pd.Series],
    event_indicator: pd.Series,
) -> list[dict[str, float | int]]:
    if time_numeric is None:
        return []

    valid_mask = time_numeric.notna()
    valid_times = time_numeric[valid_mask]
    if valid_times.empty:
        return []

    events_mask = event_indicator.reindex(valid_times.index).fillna(0).astype(int)
    bin_count = _determine_histogram_bin_count(len(valid_times))
    try:
        total_counts, bin_edges = np.histogram(valid_times, bins=bin_count)
        event_counts, _ = np.histogram(valid_times[events_mask == 1], bins=bin_edges)
        censored_counts = total_counts - event_counts
    except Exception as exc:
        logger.warning("Failed to compute histogram: %s", exc)
        return []

    histogram = []
    for idx in range(len(total_counts)):
        histogram.append(
            {
                "bin_start": float(bin_edges[idx]),
                "bin_end": float(bin_edges[idx + 1]),
                "count": int(total_counts[idx]),
                "events": int(event_counts[idx]),
                "censored": int(censored_counts[idx]),
            }
        )
    return histogram


def _compute_feature_statistics(
    df: pd.DataFrame,
    feature_columns: list[str],
    time_col: Optional[str],
    event_indicator: pd.Series,
    time_numeric: Optional[pd.Series],
) -> list[dict[str, object]]:
    if not feature_columns or time_col is None or time_col not in df.columns:
        return []

    total_rows = len(df.index)
    event_indicator = event_indicator.astype(int)
    event_mask = event_indicator == 1

    try:
        from lifelines import CoxPHFitter
        from lifelines.utils import ConvergenceWarning

        lifelines_available = True
    except ImportError:
        lifelines_available = False
        logger.warning("lifelines is not installed; Cox statistics will be omitted.")

    results: list[dict[str, object]] = []

    for feature in feature_columns:
        series = df[feature]
        is_numeric = pd.api.types.is_numeric_dtype(series)
        non_null_count = int(series.notna().sum())
        non_null_percent = (
            float((non_null_count / total_rows) * 100) if total_rows else None
        )

        mean_value = float(series.mean()) if is_numeric and non_null_count else None
        std_value = (
            float(series.std()) if is_numeric and non_null_count > 1 else None
        )

        correlation_value: Optional[float] = None
        abs_correlation: Optional[float] = None

        if is_numeric and time_numeric is not None:
            weighted_time = time_numeric * event_indicator
            corr_df = pd.DataFrame(
                {
                    "time": weighted_time,
                    "feature": series,
                }
            ).dropna()
            if (
                len(corr_df) >= 2
                and corr_df["feature"].nunique() > 1
                and corr_df["time"].nunique() > 1
            ):
                corr = corr_df["time"].corr(corr_df["feature"], method="pearson")
                if pd.notna(corr):
                    correlation_value = float(corr)
                    abs_correlation = float(abs(corr))

        cox_score = None
        cox_score_log = None

        if lifelines_available and is_numeric:
            cox_df = df[[time_col, feature]].copy()
            cox_df = cox_df.join(event_indicator.rename("event"))
            cox_df = cox_df.dropna()
            if (
                not cox_df.empty
                and int(cox_df["event"].sum()) > 0
                and cox_df[feature].nunique() > 1
            ):
                try:
                    cph = CoxPHFitter()
                    with warnings.catch_warnings():
                        warnings.simplefilter("ignore", ConvergenceWarning)
                        cph.fit(
                            cox_df[[time_col, "event", feature]],
                            duration_col=time_col,
                            event_col="event",
                        )
                    cox_score = float(cph.summary.loc[feature, "p"])
                    if cox_score > 0:
                        cox_score_log = float(np.log(cox_score))
                except Exception as exc:
                    logger.debug(
                        "Cox statistics failed for feature %s: %s", feature, exc
                    )

        results.append(
            {
                "feature": feature,
                "feature_type": "numeric" if is_numeric else "categorical",
                "non_null_percent": non_null_percent,
                "correlation_with_time": correlation_value,
                "abs_correlation": abs_correlation,
                "mean": mean_value,
                "std_dev": std_value,
                "cox_score": cox_score,
                "cox_score_log": cox_score_log,
            }
        )

    results.sort(
        key=lambda row: (
            row["abs_correlation"] is None,
            -(row["abs_correlation"] or 0.0),
        )
    )
    return results
