import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="mt-16 pt-4 border-t border-neutral-800 bg-gradient-to-b from-black via-neutral-950 to-black text-neutral-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-3 py-10 md:flex-row md:items-start md:justify-between">
        {/* Brand / description */}
        <div className="max-w-md space-y-4">
          <div className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-800 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-neutral-400">
            Individual Survival Distributions
          </div>

          <p className="text-lg font-semibold leading-snug text-neutral-50">
            Build, organize, and evaluate survival predictors from your datasets.
          </p>

          <p className="text-sm text-neutral-400">
            This site is intended for research use and may change as the platform
            evolves over time.
          </p>

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              to="/dashboard"
              className="inline-flex items-center rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-100 transition hover:border-neutral-400 hover:bg-neutral-800"
            >
              Open dashboard
            </Link>
            <Link
              to="/datasets/new"
              className="inline-flex items-center rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-neutral-400 hover:bg-neutral-900"
            >
              Upload dataset
            </Link>
            <Link
              to="/predictors/new"
              className="inline-flex items-center rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-neutral-400 hover:bg-neutral-900"
            >
              Create predictor
            </Link>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid flex-1 gap-8 text-sm sm:grid-cols-2 md:grid-cols-3">
          {/* Quick navigation */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Quick navigation
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  to="/dashboard"
                  className="transition hover:text-neutral-50"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard?tab=datasets"
                  className="transition hover:text-neutral-50"
                >
                  Datasets
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard?tab=predictors"
                  className="transition hover:text-neutral-50"
                >
                  Predictors
                </Link>
              </li>
              <li>
                <Link
                  to="/dashboard?tab=folders"
                  className="transition hover:text-neutral-50"
                >
                  Folders
                </Link>
              </li>
            </ul>
          </div>

          {/* Help & docs */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Help &amp; docs
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  to="/instructions"
                  className="transition hover:text-neutral-50"
                >
                  Instructions
                </Link>
              </li>
              <li>
                <Link
                  to="/instructions#getting-started"
                  className="transition hover:text-neutral-50"
                >
                  Getting started
                </Link>
              </li>
              <li>
                <Link
                  to="/instructions#troubleshooting"
                  className="transition hover:text-neutral-50"
                >
                  Troubleshooting
                </Link>
              </li>
              <li>
                <Link
                  to="/instructions#glossary"
                  className="transition hover:text-neutral-50"
                >
                  Glossary
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Contact
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <a
                  href="mailto:rgreiner@ualberta.ca,asgarian@ualberta.ca"
                  className="transition hover:text-neutral-50"
                >
                  Email administrators
                </a>
              </li>
              <li>
                <a
                  href="mailto:rgreiner@ualberta.ca,asgarian@ualberta.ca?subject=ISD%20Platform%20Issue"
                  className="transition hover:text-neutral-50"
                >
                  Report an issue
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-neutral-800 bg-black/95">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-100 px-7 py-4 text-[9px] text-neutral-500 md:flex-row md:items-center">
          <span>
            © {new Date().getFullYear()} Individual Survival Distributions
            Platform. All rights reserved.
          </span>
          <span className="px-5 text-[11px] text-neutral-500">
            Developed during CMPUT 401 by Team DeptOfComputingScience - Advi Islam, Alexander Ho, Excel Ojeifo,
            Hoang Nguyen, Selena Chainani, Shahmeer Rahman, and Yaatheshini Ashok Kumar.
          </span>
        </div>
      </div>
    </footer>
  );
}
