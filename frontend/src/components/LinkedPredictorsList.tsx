import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/apiClient"; // Adjust path as needed

// Minimal type for a predictor in this list
type LinkedPredictor = {
  predictor_id: number;
  name: string;
  owner: {
    username: string;
  };
  updated_at: string;
};

// API function to fetch predictors for a dataset
async function listPredictorsForDataset(datasetId: number): Promise<LinkedPredictor[]> {
  return api.get<LinkedPredictor[]>(`/api/datasets/${datasetId}/predictors/`);
}

// Props for the component
type LinkedPredictorsListProps = {
  datasetId: number;
};

export default function LinkedPredictorsList({ datasetId }: LinkedPredictorsListProps) {
  const [predictors, setPredictors] = useState<LinkedPredictor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- Pagination State ---
  const [page, setPage] = useState(1);
  const [pageSize] = useState(5); // Show 5 predictors per page

  // --- Data Fetching ---
  useEffect(() => {
    if (!datasetId) return;

    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await listPredictorsForDataset(datasetId);
        setPredictors(data);
      } catch (err) {
        setError("Failed to load associated predictors.");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [datasetId]);

  // --- Client-Side Pagination Logic ---
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(predictors.length / pageSize)),
    [predictors.length, pageSize]
  );

  const paginatedPredictors = useMemo(() => {
    const start = (page - 1) * pageSize;
    return predictors.slice(start, start + pageSize);
  }, [predictors, page, pageSize]);

  // Reset page if predictors list changes (e.g., on filter)
  useEffect(() => {
    setPage(1);
  }, [predictors.length, pageSize]);

  // --- Render Logic ---
  if (isLoading) {
    return (
      <div className="py-3 text-center text-sm text-neutral-500">
        Loading associated predictors...
      </div>
    );
  }

  if (error) {
    return <div className="py-3 text-center text-sm text-red-600">{error}</div>;
  }

  if (predictors.length === 0) {
    return (
      <div className="py-3 text-center text-sm text-neutral-500">
        No predictors are currently using this dataset.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-white">
        {paginatedPredictors.map((predictor) => (
          <li key={predictor.predictor_id} className="p-3">
            <Link
              to={`/predictors/${predictor.predictor_id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {predictor.name}
            </Link>
            <div className="mt-1 text-xs text-neutral-500">
              Owned by {predictor.owner.username} • Last updated{" "}
              {new Date(predictor.updated_at).toLocaleDateString()}
            </div>
          </li>
        ))}
      </ul>
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          onJump={(n) => setPage(n)}
        />
      )}
    </div>
  );
}

// --- Pagination Component ---
// (You can move this to its own file later, but placing it here for now)
function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
  onJump,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onJump: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {page > 1 && (
        <button className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50" onClick={onPrev}>
          PREV
        </button>
      )}
      {/* Simple pagination: show all page numbers */}
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          className={`rounded-md border px-3 py-1 text-sm ${
            n === page ? "bg-neutral-200 font-bold" : "hover:bg-neutral-50"
          }`}
          onClick={() => onJump(n)}
        >
          {n}
        </button>
      ))}
      {page < totalPages && (
        <button className="rounded-md border px-2 py-1 text-sm hover:bg-neutral-50" onClick={onNext}>
          NEXT
        </button>
      )}
    </div>
  );
}