// src/pages/About.tsx
// ISD About page — preserves the figure order and core exposition,
// but updates links, adds team info, and aligns language with the 2025 slides.

import { useState } from "react";
import { Link } from "react-router-dom";
import fig1 from "../assets/Fig_1.png";
import fig2 from "../assets/Fig_2.png";
import fig3_left from "../assets/Predicted_survival_curve_Patient_B.png";
import fig3_right from "../assets/Predicted_survival_curve_Patient_A.png";
import fig4 from "../assets/Fig_4.png";

const LINKS = {
  analyzeSite: "/instructions",
  slides:
    "https://drive.google.com/file/d/1w45WpZw8whoM9diinrEuHu00i1rficJZ/view",
  tutorial: "/instructions",
  predictors: "/browse",
  summary2025:
    "https://docs.google.com/document/d/1cgClW-OZOmlQdK_D7BGl00aaJLG0v9Jau0ES3T6hhdQ/edit?tab=t.0",
};

export default function About() {
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <main className="min-h-[calc(100vh-var(--app-nav-h,3.7rem))] bg-neutral-100">
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 text-neutral-900">
        {/* Page header */}
        <header className="mb-6 border-b border-neutral-200 pb-4">
          <h1 className="text-2xl font-extrabold leading-tight text-neutral-900 md:text-3xl">
            Individual Survival Distributions (ISD)
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            This page summarizes the ideas behind ISDs and the PSSP system that
            powers this site.
          </p>
        </header>

        <div className="space-y-6">
          {/* Opening paragraphs + Fig 1 */}
          <section className="rounded-xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
            <p className="leading-7 text-sm md:text-[15px]">
              A “survival prediction” model predicts the time to an event for
              each individual. While the standard example is “time to death” for
              a specific patient, there are many other applications – e.g., in
              medicine this could be the time to relapse or recovery; in
              business, the time until a customer stops shopping at a particular
              store (customer churn); in engineering, the time until a component
              fails; etc.
            </p>
            <p className="mt-4 leading-7 text-sm md:text-[15px]">
              Here, we provide a way to learn such a survival prediction model
              from a “survival dataset”, which describes many previous subjects,
              including a specific time for each subject. This resembles
              regression – we want to learn a real-valued function mapping each
              subject to a non-negative time – but differs because survival
              datasets almost always include{" "}
              <span className="font-medium">censored instances</span>, where we
              only know a lower bound on the time. Consider, for example, a
              5-year study that began in 1990. Over that interval, some patients
              died, but many were still alive when the study ended; others
              stopped coming to clinic visits and were “lost to follow-up” – see
              the left part of the figure below.
            </p>
            <figure className="mt-5">
              <img
                src={fig1}
                alt="Censoring timeline and patient table showing Time and Censored bit"
                className="mx-auto rounded-xl border border-gray-300 bg-white object-contain shadow-sm"
                onClick={() => setPreview(fig1)}
              />
              <figcaption className="mt-2 text-center text-xs text-neutral-600">
                Fig 1: Example study timeline and censoring indicators for each
                subject.
              </figcaption>
            </figure>
          </section>

          {/* Censoring explanation + KM description + Fig 2 */}
          <section className="rounded-xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
            <p className="leading-7 text-sm md:text-[15px]">
              These patients are considered “censored” – see the table on the
              right side of Fig 1. The label for every patient includes both a
              real-valued{" "}
              <span className="font-medium">Time</span> and a{" "}
              <span className="font-medium">Censored</span> bit: by convention,
              “1” means uncensored (the event was observed) and “0” means
              censored (the recorded time is only a lower bound on the true
              time-to-event). If only a few percent were censored, we could
              plausibly ignore them at training time. In many real datasets,
              however, the majority of instances are censored (often &gt;80%),
              so censoring must be handled explicitly.
            </p>
            <p className="mt-4 leading-7 text-sm md:text-[15px]">
              This means we cannot simply use standard regression algorithms
              that require fully specified labels. Instead, survival prediction
              has developed several modeling strategies. Some models learn{" "}
              <span className="font-medium">risk scores</span> – numbers that
              rank who will experience the event first, but are not themselves
              times. Others learn{" "}
              <span className="font-medium">single-time probabilities</span>,
              such as “25% chance of dying within 1 year”. Neither of these
              directly answers the question “How long will I live?”. A common
              compromise is a{" "}
              <span className="font-medium">population survival curve</span>,
              such as the Kaplan–Meier curve below for a cohort of Stage 4
              stomach cancer patients. Each point on the curve gives the
              probability that a patient with this condition will survive at
              least that long. From this, we might report the median survival
              time (e.g., 20.5 months).
            </p>
            <figure className="mt-5">
              <img
                src={fig2}
                alt="Kaplan–Meier curve with median at 20.5 months"
                className="mx-auto rounded-xl border border-gray-300 bg-white object-contain shadow-sm"
                onClick={() => setPreview(fig2)}
              />
              <figcaption className="mt-2 text-center text-xs text-neutral-600">
                Fig 2: Example Kaplan–Meier curve for a sub-population of
                patients.
              </figcaption>
            </figure>
          </section>

          {/* ISD vs aggregate + Fig 3 (left, right) */}
          <section className="rounded-xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
            <p className="leading-7 text-sm md:text-[15px]">
              The limitation of a single population curve is that it averages
              over many different patients. It does not use the full set of
              patient-specific covariates (such as stage, biomarkers, or other
              clinical measurements). The{" "}
              <span className="font-medium">
                Individual Survival Distribution (ISD)
              </span>{" "}
              approach instead produces a{" "}
              <span className="font-medium">personalized survival curve</span>{" "}
              for each patient. Figure 3 shows ISDs for two Stage 4 stomach
              cancer patients from the same cohort as Fig 2. While the
              aggregated curve suggests a “typical” survival around 20.5
              months, these two patients have very different ISDs – and hence
              very different predicted survival times (roughly 3 months for the
              left patient and 18 months for the right).
            </p>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <img
                src={fig3_left}
                alt="ISD example — left patient (~3 months)"
                className="rounded-xl border border-gray-300 bg-white object-contain shadow-sm"
                onClick={() => setPreview(fig3_left)}
              />
              <img
                src={fig3_right}
                alt="ISD example — right patient (~18 months)"
                className="rounded-xl border border-gray-300 bg-white object-contain shadow-sm"
                onClick={() => setPreview(fig3_right)}
              />
            </div>
            <p className="mt-2 text-center text-xs text-neutral-600">
              Fig 3: Two example individual survival distributions from the same
              disease cohort.
            </p>
            <p className="mt-4 leading-7 text-sm md:text-[15px]">
              On this site, ISDs are typically produced by{" "}
              <span className="font-medium">MTLR</span> (Multi-Task Logistic
              Regression), which learns a full distribution over time for each
              patient and is designed to be{" "}
              <span className="font-medium">D-calibrated</span> – meaning that
              the predicted probabilities can be interpreted directly at many
              time points.
            </p>
          </section>

          {/* Many ISDs + Fig 4 */}
          <section className="rounded-xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
            <p className="leading-7 text-sm md:text-[15px]">
              Figure 4 illustrates many ISDs from a single disease cohort. The
              variation in curve shapes and medians highlights how strongly
              patient-specific features can influence survival, and why
              individualized curves can provide more useful information than a
              single population-level estimate.
            </p>
            <figure className="mt-5">
              <img
                src={fig4}
                alt="Overlay of many predicted individual survival curves"
                className="mx-auto rounded-xl border border-gray-300 bg-white object-contain shadow-sm"
                onClick={() => setPreview(fig4)}
              />
              <figcaption className="mt-2 text-center text-xs text-neutral-600">
                Fig 4: A collection of ISDs showing the diversity of individual
                survival curves.
              </figcaption>
            </figure>
          </section>

          {/* Team / acknowledgements */}
          <section className="rounded-xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-neutral-900">
              Team behind ISD & PSSP
            </h2>
            <p className="mt-3 leading-7 text-sm md:text-[15px]">
              The ISD methodology and the PSSP system on this site build on
              many years of research on survival prediction at the University of
              Alberta and Amii. The core ISD work, including the use of MTLR
              for individualized survival distributions and its evaluation
              across multiple datasets, was developed by researchers including
              Haider, Hoehn, Davis, and Greiner and collaborators in the ISD
              group.
            </p>
            <p className="mt-3 leading-7 text-sm md:text-[15px]">
              The web interface you are using here was designed to make these
              methods accessible to clinicians, researchers, and students. It
              was developed by CMPUT 401 students (Team DeptOfComputingScience)
              at the University of Alberta, in collaboration with and under the 
              guidance of Dr. Russ Greiner and Nasimeh Asgarian, and some additional
              support from Shi-ang Qi. Team DeptOfComputingScience would like
              to express our sincerest thanks for all the support!
              
              For a broader overview of related projects and
              collaborators, see the{" "}
              <a
                href={LINKS.summary2025}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                Survival Prediction Summary (2025)
              </a>
              , which also links to papers, talks, and additional code.
            </p>
          </section>

          {/* Links paragraph + CTA button + final paragraph with link */}
          <section className="rounded-xl border border-neutral-200 bg-white/90 p-5 shadow-sm">
            <p className="leading-7 text-sm md:text-[15px]">
              This website provides an interactive interface to the ISD/PSSP
              codebase. You can{" "}
              <Link
                to={LINKS.analyzeSite}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                follow the tutorial to analyze your own dataset
              </Link>{" "}
              and fit individualized survival models directly in the browser.
              For an in-depth introduction to survival prediction and ISDs, see
              the{" "}
              <a
                href={LINKS.slides}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                Survival Prediction Tutorial slides (2025)
              </a>
              .
            </p>
            <p className="mt-4 leading-7 text-sm md:text-[15px]">
              If you prefer to explore existing models, you can browse publicly
              accessible predictors{" "}
              <Link
                to={LINKS.predictors}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                here
              </Link>
              . Each predictor page shows cross-validation performance,
              calibration summaries, and example survival curves.
            </p>
          </section>
        </div>
      </div>

      {/* Lightbox */}
      {preview && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] rounded-2xl border border-neutral-200 bg-white p-3 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={preview}
              alt="Preview"
              className="max-h-[80vh] max-w-[85vw] rounded-lg object-contain"
            />
            <button
              className="absolute right-3 top-3 inline-flex items-center rounded-md bg-neutral-900 px-3 py-2 text-xs font-medium text-white shadow hover:bg-neutral-800"
              onClick={() => setPreview(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
