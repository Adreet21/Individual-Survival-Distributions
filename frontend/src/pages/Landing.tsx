import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Database,
  Activity,
  BarChart3,
  RefreshCcw,
} from "lucide-react";
import graphic1 from "../assets/graphicLanding1.png";

function FeatureChip({
  title,
  text,
  icon,
}: {
  title: string;
  text: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-3 grid h-16 w-16 place-items-center rounded-xl bg-neutral-200 text-neutral-700">
        {icon}
      </div>
      <div className="text-sm font-semibold text-neutral-900">{title}</div>
      <p className="mt-1 max-w-[15rem] text-xs text-neutral-600">{text}</p>
    </div>
  );
}

function CurveThumbnail({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-28 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
        <svg
          viewBox="0 0 120 80"
          className="h-full w-full text-neutral-500"
          aria-hidden="true"
        >
          <line
            x1="18"
            y1="8"
            x2="18"
            y2="72"
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.7}
          />
          <line
            x1="18"
            y1="72"
            x2="112"
            y2="72"
            stroke="currentColor"
            strokeWidth={1}
            opacity={0.7}
          />

          {/* high */}
          <path
            d="M18 16 C 40 14, 70 26, 112 60"
            fill="none"
            stroke="#4ade80"
            strokeWidth={2}
            strokeLinecap="round"
          />

          {/* low */}
          <path
            d="M18 26 C 42 30, 72 44, 112 72"
            fill="none"
            stroke="#fb7185"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </div>
      <p className="text-[11px] text-neutral-500">{label}</p>
    </div>
  );
}

type WorkflowAlign = "left" | "center" | "right";

interface WorkflowTileProps {
  label: string;
  title: string;
  body: string;
  align?: WorkflowAlign;
  children: React.ReactNode;
}

function WorkflowTile({
  label,
  title,
  body,
  align = "center",
  children,
}: WorkflowTileProps) {
  const alignmentClass =
    align === "left"
      ? "items-start text-left"
      : align === "right"
      ? "items-end text-right"
      : "items-center text-center";

  const tooltipPositionClass =
    align === "left"
      ? "left-0 md:left-1/2 md:-translate-x-1/2"
      : align === "right"
      ? "right-0 md:left-1/2 md:-translate-x-1/2"
      : "left-1/2 -translate-x-1/2";

  return (
    <div className={`group relative flex flex-col ${alignmentClass}`}>
      <div className="rounded-2xl border border-neutral-300 bg-white px-4 py-3 shadow-sm transition-transform transition-colors duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-neutral-900 group-hover:shadow-md">
        <p className="text-[15px] font-semibold uppercase tracking-wide text-neutral-500">
          {label}
        </p>
        <p className="mt-1 text-md font-semibold text-neutral-900">{title}</p>
        <div className="mt-3">{children}</div>
      </div>
      <div
        className={`pointer-events-none absolute top-full z-40 mt-3 hidden w-64 rounded-md bg-neutral-900 px-3 py-2 text-[15px] leading-snug text-neutral-50 shadow-xl group-hover:block ${tooltipPositionClass}`}
      >
        {body}
      </div>
    </div>
  );
}

// the scroll shit
export default function Landing() {
  const scrollToOverview = () => {
    const el = document.getElementById("pssp-overview");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const scrollToWorkflow = () => {
    const el = document.getElementById("pssp-workflow");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    let hasReachedWorkflow = false;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0) return;

      const workflow = document.getElementById("pssp-workflow");
      if (!workflow) return;

      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight;
      const scrollY = window.scrollY || window.pageYOffset;
      const workflowTop = workflow.offsetTop;
      if (!hasReachedWorkflow && scrollY + viewportHeight >= workflowTop) {
        hasReachedWorkflow = true;
      }

      if (!hasReachedWorkflow) {
        e.preventDefault();
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <main className="bg-white">
      {/* HERO – full-width black strip */}
      <section className="relative bg-neutral-950 text-white">
        <div className="mx-auto max-w-6xl px-4">
          <section
            id="landing-hero"
            className="grid min-h-[calc(100vh-4rem)] items-start gap-10 pb-24 pt-16 md:grid-cols-2"
          >
            {/* Left copy */}
            <div className="pr-2">
              <p className="text-[15px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Individual Survival Distributions
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-[32px]">
                Patient-specific survival predictions,
                <br />
                built for research and practice.
              </h1>

              <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-neutral-300">
                PSSP fits individualized survival models on historical patient
                cohorts and produces an individual survival distribution (ISD) -
                a full survival curve - for each new patient based on their covariates.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/instructions"
                  className="inline-flex items-center justify-center rounded-[10px] bg-white px-4 py-2 text-md font-semibold text-neutral-900 shadow-sm hover:bg-neutral-200"
                >
                  View the tutorial
                </Link>
                <Link
                  to="/browse"
                  className="inline-flex items-center justify-center rounded-[10px] border border-white/15 bg-neutral-900 px-4 py-2 text-md font-semibold text-white shadow-sm hover:bg-neutral-800"
                >
                  Explore predictors
                </Link>
              </div>
            </div>

            {/* Right graphic box */}
            <div className="flex items-start justify-center md:pl-6">
              <div className="grid aspect-[3/2] w-full max-w-[460px] overflow-hidden place-items-center rounded-[18px] border border-white/10 bg-neutral-900 shadow-sm">
                <img
                  src={graphic1}
                  alt="Example survival distributions"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Scroll arrow to overview */}
        <button
          type="button"
          onClick={scrollToOverview}
          className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center text-[15px] font-medium text-neutral-300 hover:text-white"
        >
          <span className="mb-1 pb-2">Learn more about PSSP</span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-600 bg-neutral-900/60 backdrop-blur-sm">
            <ArrowDown className="h-4 w-4" />
          </span>
        </button>
      </section>

      {/* OVERVIEW: grey band (middle) */}
      <section id="pssp-overview" className="bg-neutral-100 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="grid items-center gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="max-w-xl">
              <h2 className="text-[20px] font-semibold tracking-tight sm:text-[22px]">
                Working with the PSSP codebase
              </h2>
              <div className="mt-4 text-[17px] leading-relaxed text-neutral-700">
                <p>
                  This site is a web interface for the patient-specific survival
                  prediction (PSSP) framework from the Survival Prediction
                  Tutorial. It lets you upload a right-censored survival dataset
                  and fit models that return an individual survival distribution
                  (ISD) for each patient, rather than a single risk score.
                </p>
                <p className="mt-2">
                  You can{" "}
                  <Link
                    to="/dashboard"
                    className="underline underline-offset-2"
                  >
                    upload and analyze a dataset here
                  </Link>{" "}
                  to explore patient-specific curves, summary statistics (such
                  as median survival time), and evaluation metrics like
                  concordance and integrated Brier score.
                </p>
                <p className="mt-2">
                  For an overview of the methodology and design choices behind
                  PSSP - that is, risk scores, population curves, and individual survival
                  distributions - see the{" "}
                  <a
                    href="https://drive.google.com/file/d/1w45WpZw8whoM9diinrEuHu00i1rficJZ/view"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Survival Prediction Tutorial slides
                  </a>
                  . For a step-by-step guide to this web interface, see the{" "}
                  <Link
                    to="/instructions"
                    className="underline underline-offset-2"
                  >
                    tutorial
                  </Link>
                  . Publicly accessible predictors are available{" "}
                  <Link
                    to="/browse"
                    className="underline underline-offset-2"
                  >
                    here
                  </Link>
                  .
                </p>
                <p className="mt-2">
                  For a written summary of ISDs and the PSSP system that powers this site,
                  see the{" "}
                  <Link
                    to="/about"
                    className="underline underline-offset-2"
                  >
                    About page
                  </Link>
                  .
                </p>
              </div>
            </div>

            {/* Small feature grid summary */}
            <div className="rounded-2xl border border-black/5 bg-white p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-neutral-900">
                What PSSP provides
              </h3>
              <p className="mt-2 text-[14px] text-neutral-600">
                Built for academic and professional work: reusable models,
                reproducible experiments, and publication-ready curves.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <FeatureChip
                  title="Cohort-level learning"
                  text="Train on historical datasets with right-censoring and clinically relevant covariates."
                  icon={<Database className="h-6 w-6" />}
                />
                <FeatureChip
                  title="Individualized curves"
                  text="Produce a full survival distribution for each patient, not just a single risk score."
                  icon={<Activity className="h-6 w-6" />}
                />
                <FeatureChip
                  title="Flexible outputs"
                  text="Visualize curves, summary statistics (e.g., median survival), and stratified plots for downstream analysis."
                  icon={<BarChart3 className="h-6 w-6" />}
                />
                <FeatureChip
                  title="Reproducible runs"
                  text="Record model configurations so analyses can be repeated, compared, or shared."
                  icon={<RefreshCcw className="h-6 w-6" />}
                />
              </div>
            </div>
          </div>

          {/* Arrow down to workflow */}
          <div className="mt-12 flex justify-center">
            <button
              type="button"
              onClick={scrollToWorkflow}
              className="flex flex-col items-center text-[15px] font-medium text-neutral-500 hover:text-neutral-800"
            >
              <span className="mb-1">See the full workflow</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white shadow-sm">
                <ArrowDown className="h-4 w-4" />
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* WORKFLOW: bottom, white background */}
      <section id="pssp-workflow" className="bg-white pb-16 pt-10 md:pt-12">
        <div className="mx-auto max-w-6xl px-4">
          <div className="rounded-2xl border border-black/5 bg-white px-4 py-8 md:px-8 md:py-10">
            <h2 className="text-center text-[20px] font-semibold tracking-tight sm:text-[22px]">
              From historical cohorts to patient-specific survival curves
            </h2>
            <p className="mx-auto mt-3 max-w-4xl text-center text-[18px] leading-relaxed text-neutral-700">
              PSSP trains an individualized survival distribution (ISD) model on
              a cohort with censored outcomes, then uses that model to generate
              a full survival curve for each novel patient. Hover over each
              block below to see how the pieces fit together.
            </p>

            {/* Top: historical data -> learner */}
            <div className="mx-auto mt-6 max-w-4xl space-y-4">
              <div className="flex flex-col items-center gap-4">
                <WorkflowTile
                  label="Historical cohort"
                  title="Patient-level feature table"
                  body="Each row represents one patient, with columns for prognostic factors and time-to-event outcome (including censoring). PSSP reads this table as the training data."
                  align="center"
                >
                  <div className="grid grid-cols-6 gap-[2px] rounded-md bg-emerald-50 p-1 text-[9px] text-neutral-800">
                    {["Site", "Stage", "Age", "Sex", "WBC", "Event"].map(
                      (h) => (
                        <div
                          key={h}
                          className="flex items-center justify-center rounded-[2px] bg-emerald-100 font-semibold"
                        >
                          {h}
                        </div>
                      ),
                    )}
                    {Array.from({ length: 18 }).map((_, i) => (
                      <div key={i} className="h-4 rounded-[2px] bg-emerald-50" />
                    ))}
                  </div>
                </WorkflowTile>

                <div className="flex items-center justify-center">
                  <ArrowDown className="h-5 w-5 text-neutral-400" />
                </div>

                <WorkflowTile
                  label="Model fitting"
                  title="ISD learner"
                  body="The ISD learner fits a flexible survival model that captures how covariates influence the entire survival distribution, while accounting for censoring."
                  align="center"
                >
                  <div className="flex items-center justify-center">
                    <div className="flex h-16 w-40 items-center justify-center rounded-full border border-emerald-400 bg-emerald-50 text-xs font-semibold text-emerald-800">
                      ISD Learner
                    </div>
                  </div>
                </WorkflowTile>
              </div>

              {/* Bottom: novel patient -> model -> curve */}
              <div className="mt-4 flex flex-col items-stretch gap-6 md:flex-row md:items-center md:justify-between">
                <WorkflowTile
                  label="Novel patient"
                  title="Single-patient feature row"
                  body="A new patient is represented by the same set of features used during training (e.g., stage, biomarkers, demographics)."
                  align="left"
                >
                  <div className="w-full rounded-md bg-neutral-50 p-2 text-[9px] text-neutral-800">
                    <div className="flex justify-between border-b border-neutral-200 pb-1 font-semibold">
                      <span>Site</span>
                      <span>Stage</span>
                      <span>Age</span>
                      <span>WBC</span>
                    </div>
                    <div className="mt-1 flex justify-between text-[10px]">
                      <span>Neck</span>
                      <span>4</span>
                      <span>74</span>
                      <span>8.3</span>
                    </div>
                  </div>
                </WorkflowTile>

                <div className="hidden h-full flex-1 items-center justify-center md:flex">
                  <ArrowRight className="h-5 w-5 text-neutral-400" />
                </div>

                <WorkflowTile
                  label="Model"
                  title="PSSP model, θ"
                  body="The trained PSSP model encodes how risk evolves over time for different feature combinations. It can be expanded to be exported, shared, and reused on other datasets with matching features."
                  align="center"
                >
                  <div className="flex items-center justify-center">
                    <div className="rounded-xl border border-neutral-300 bg-neutral-100 px-6 py-4 text-xs font-medium text-neutral-800">
                      PSSP Model, <span className="italic">θ</span>
                    </div>
                  </div>
                </WorkflowTile>

                <div className="hidden h-full flex-1 items-center justify-center md:flex">
                  <ArrowRight className="h-5 w-5 text-neutral-400" />
                </div>

                <WorkflowTile
                  label="Output"
                  title="Individual survival curve"
                  body="For each patient, the model produces a full survival distribution over time. These curves can be summarized, compared across subgroups, or expanded for exports for downstream analyses."
                  align="right"
                >
                  <div className="max-w-[220px]">
                    <CurveThumbnail label="Predicted survival over time" />
                  </div>
                </WorkflowTile>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
