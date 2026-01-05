import { Link } from "react-router-dom";
import type { JSX } from "react/jsx-runtime";
import { useState, useEffect } from "react";

export default function Instructions(): JSX.Element {
  const [activeSection, setActiveSection] = useState("overview");

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const sectionIds = [
    "getting-started",
    "overview",
    "edit-profile",
    "dashboard-basics",
    "datasets",
    "upload-dataset",
    "folder-management",
    "predictors",
    "save-draft",
    "train-predictor",
    "retrain-predictor",
    "predictor-detail",
    "using-predictors",
    "use-predictor",
    "filter-search",
    "help",
    "troubleshooting",
    "glossary",
  ];

  useEffect(() => {
    const handleScroll = () => {
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 100) current = id;
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", handleScroll);
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sidebarItems = [
    {
      title: "Getting Started",
      id: "getting-started",
      children: [
        { id: "overview", label: "Video Walkthrough" },
        { id: "edit-profile", label: "Account Details" },
        { id: "dashboard-basics", label: "Dashboard Basics" },
      ],
    },
    {
      title: "Datasets and Folders",
      id: "datasets",
      children: [
        { id: "upload-dataset", label: "Upload a Dataset" },
        { id: "folder-management", label: "Folder Management" },
      ],
    },
    {
      title: "Building Predictors",
      id: "predictors",
      children: [
        { id: "save-draft", label: "Save Draft Predictor" },
        { id: "train-predictor", label: "Train a Predictor" },
        { id: "retrain-predictor", label: "Retrain a Predictor" },
        { id: "predictor-detail", label: "Predictor Detail Page" },
      ],
    },
    {
      title: "Using Predictors",
      id: "using-predictors",
      children: [
        { id: "use-predictor", label: "Make Predictions" },
        { id: "filter-search", label: "Filtering & Search" },
      ],
    },
    {
      title: "Help & Support",
      id: "help",
      children: [
        { id: "troubleshooting", label: "Troubleshooting" },
        { id: "glossary", label: "Glossary" },
      ],
    },
  ];

  return (
    <section className="w-full bg-neutral-100 pt-[var(--app-nav-h,2.7rem)] pb-10">
      <div className="mx-auto flex max-w-6xl gap-6 px-4">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-[calc(var(--app-nav-h,3.7rem)+1rem)] h-fit overflow-hidden rounded-lg border border-black/10 bg-white shadow-sm">
            <div className="border-b border-black/10 bg-neutral-900 px-4 py-3 text-large font-semibold tracking-wide text-white">
              Instructions
            </div>

            <div className="p-3 text-xs text-neutral-500">
              Use this guide to set up your account, upload datasets, and build
              predictors.
            </div>

            <nav className="space-y-4 px-3 pb-4 text-sm">
              {sidebarItems.map((section) => {
                const sectionActive =
                  section.children.some((c) => c.id === activeSection) ||
                  activeSection === section.id;

                return (
                  <div key={section.id} className="space-y-1">
                    <button
                      onClick={() => scrollToSection(section.id)}
                      className={`w-full rounded-md px-2 py-1.5 text-left text-xs font-semibold tracking-wide transition ${
                        sectionActive
                          ? "bg-neutral-700 text-white"
                          : "text-neutral-800 hover:bg-neutral-100"
                      }`}
                    >
                      {section.title}
                    </button>

                    <div className="ml-2 space-y-0.5 border-l border-neutral-200 pl-2">
                      {section.children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => scrollToSection(child.id)}
                          className={`block w-full rounded-md px-2 py-1 text-left text-xs transition ${
                            activeSection === child.id
                              ? "bg-neutral-200 text-neutral-900"
                              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                          }`}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1">
          <div className="space-y-8 rounded-xl border border-black/5 bg-white p-6 shadow-sm">
            {/* Overview Notice */}
            <div className="rounded-lg border border-neutral-200 bg-neutral-200 p-4">
              <h1 className="text-xl font-semibold text-neutral-900">
                How to Use This Website  𓂃 ࣪˖ ִֶཐི༏ཋྀ
              </h1>
              <p className="mt-2 text-sm text-neutral-700">
                Start with the overview video for a quick tour, or follow the
                sections below to set up your account, upload datasets, train
                predictors, and make survival analysis predictions.
              </p>
            </div>

{/* Getting Started */}
<section id="getting-started" className="scroll-mt-24 space-y-4">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-3xl font-bold text-neutral-900">
        Getting Started
      </h2>
      <p className="mt-1 text-base text-neutral-600">
        A quick tour of the main things you need to do first: watch the
        overview, set up your account, and explore the Dashboard.
      </p>
    </div>
  </div>

  {/* Video Walkthrough */}
  <section id="overview" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-neutral-50">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Video Walkthrough
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Short tour of the site, from upload to prediction.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-neutral-900 px-2 py-0.5 text-xs font-semibold uppercase text-white">
            RECOMMENDED
          </span>
          <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
            ▾
          </span>
        </div>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3 text-sm text-neutral-600">
        <p>
          Start with a short tour of the site. It shows how to upload datasets,
          train predictors, and run predictions.
        </p>
        <div className="mt-3 w-full max-w-3xl">
          <iframe
            src="https://drive.google.com/file/d/1f0mE0fCSqt5YZdOFMuFeU1B3K7O6ANR2/preview"
            className="aspect-video w-full rounded-lg border border-neutral-200"
            allow="autoplay"
            allowFullScreen
          />
        </div>
      </div>
    </details>
  </section>

  {/* Account Details */}
  <section id="edit-profile" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Account Details
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Step 1 - Create an account and manage your profile.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
            ▾
          </span>
        </div>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            <Link to="/signup" className="text-blue-600 underline">
              Sign up
            </Link>{" "}
            and{" "}
            <Link to="/signup" className="text-blue-600 underline">
              sign in
            </Link>{" "}
            to access the Dashboard.
          </li>
          <li>• 
            Use{" "}
            <Link to="/settings" className="text-blue-600 underline">
              Settings
            </Link>{" "}
            to edit your profile or change your password.
          </li>
          <li>
            • Need elevated access? Email the{" "}
            <a
              href="mailto:rgreiner@ualberta.ca,asgarian@ualberta.ca"
              className="text-blue-600 underline"
            >
              administrators
            </a>{" "}
            to request Superuser/Admin permissions.
          </li>
          <li>
            • Locked out? Click{" "}
            <Link to="/reset" className="text-blue-600 underline">
              Forgot Password?
            </Link>{" "}
            on the sign-in page.
          </li>
        </ul>
      </div>
    </details>
  </section>

  {/* Dashboard Basics */}
  <section id="dashboard-basics" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Dashboard Basics
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Step 2 - Find and manage your datasets, predictors, and folders.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
            ▾
          </span>
        </div>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <p className="mb-2 text-sm text-neutral-600">
          The Dashboard is your home base for datasets, predictors, and folders.
        </p>
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            • Open the{" "}
            <Link to="/dashboard" className="text-blue-600 underline">
              Dashboard
            </Link>{" "}
            to see all{" "}
            <Link
              to="/dashboard?tab=predictors"
              className="text-blue-600 underline"
            >
              predictors
            </Link>
            ,{" "}
            <Link
              to="/dashboard?tab=datasets"
              className="text-blue-600 underline"
            >
              datasets
            </Link>
            , and{" "}
            <Link
              to="/dashboard?tab=folders"
              className="text-blue-600 underline"
            >
              folders
            </Link>{" "}
            you can access.
          </li>
          <li>• Drag and drop items into folders to keep things organized.</li>
          <li>
            • Click a card to reveal actions like{" "}
            <span className="font-medium">View</span>,{" "}
            <span className="font-medium">Edit</span>, or{" "}
            <span className="font-medium">Delete</span>.
          </li>
        </ul>
      </div>
    </details>
  </section>
</section>

{/* Datasets & Folders */}
<section id="datasets" className="scroll-mt-24 space-y-4">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-3xl font-bold text-neutral-900">
        Datasets and Folders
      </h2>
      <p className="mt-1 text-base text-neutral-600">
        Upload your data and organize it so you can find the
        right dataset when you need it.
      </p>
    </div>
  </div>

  {/* Upload Dataset */}
  <section id="upload-dataset" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Upload a Dataset
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Required - add your data before you can train a predictor.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase text-neutral-700">
            Required
          </span>
          <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
            ▾
          </span>
        </div>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            • Use the <span className="font-medium">Create</span> menu on the{" "}
            <Link to="/dashboard" className="text-blue-600 underline">
              Dashboard
            </Link>{" "}
            or go directly to{" "}
            <Link to="/datasets/new" className="text-blue-600 underline">
              Upload Dataset
            </Link>
            .
          </li>
          <li>• Give your dataset a clear name and description.</li>
          <li>
            • Ensure the file is in a supported format (e.g.{" "}
            <code className="rounded bg-neutral-100 px-1 text-xs">
              .csv
            </code>
            ) and that missing values are handled before upload.
          </li>
          <li>
            • After uploading, open the{" "}
            <span className="font-medium">Datasets</span> tab to review or
            manage it.
          </li>
        </ul>
      </div>
    </details>
  </section>

  {/* Folder Management */}
  <section id="folder-management" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Folder Management
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Optional but recommended - keep related items together.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-semibold uppercase text-neutral-700">
            Optional
          </span>
          <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
            ▾
          </span>
        </div>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            • Create new folders from the Dashboard using the{" "}
            <span className="font-medium">Create &gt; Folder</span> option.
          </li>
          <li>
            • Drag datasets and predictors onto folder cards or the folder
            sidebar to move them.
          </li>
          <li>
            • Use folders to group items by project, study, or experiment for
            easier navigation.
          </li>
        </ul>
      </div>
    </details>
  </section>
</section>

{/* Building Predictors */}
<section id="predictors" className="scroll-mt-24 space-y-4">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-3xl font-bold text-neutral-900">
        Building Predictors
      </h2>
      <p className="mt-1 text-base text-neutral-600">
        Configure, train, and retrain predictive models for survival
        analysis.
      </p>
    </div>
  </div>

  {/* Save Draft */}
  <section id="save-draft" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Save Draft Predictor
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Capture your configuration even if you aren’t ready to train yet.
          </span>
        </div>
        <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            • Start creating a predictor, then click{" "}
            <span className="font-medium">Back</span> and choose{" "}
            <span className="font-medium">Save as Draft</span>.
          </li>
          <li>
            • You must select a dataset before saving; otherwise you’ll be
            prompted to pick one.
          </li>
          <li>
            • Draft predictors appear on the{" "}
            <span className="font-medium">Predictors</span> tab of the
            Dashboard and are private by default.
          </li>
        </ul>
      </div>
    </details>
  </section>

  {/* Train Predictor */}
  <section id="train-predictor" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Train a Predictor
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Turn your dataset into a working survival model.
          </span>
        </div>
        <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            •  Choose a dataset, configure features and settings, then click{" "}
            <span className="font-medium">Train &amp; Save</span>.
          </li>
          <li>
            •  The current system supports the{" "}
            <span className="font-medium">MTLR</span> model; additional
            models may be added by administrators.
          </li>
          <li>
            •  After training, the predictor’s status and metrics are shown on its
            detail page.
          </li>
        </ul>
      </div>
    </details>
  </section>

  {/* Retrain Predictor */}
  <section id="retrain-predictor" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Retrain a Predictor
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Update an existing model with new feature selections or settings.
          </span>
        </div>
        <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            • Open a trained predictor and adjust its configuration (features,
            time points, etc.).
          </li>
          <li>
            • Retrain and either overwrite the existing predictor or save the
            result as a new predictor.
          </li>
        </ul>
      </div>
    </details>
  </section>

  {/* Predictor Detail Page */}
  <section id="predictor-detail" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-neutral-50">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Predictor Detail Page
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            See how a predictor was trained, how it performs, and how it can be
            reused.
          </span>
        </div>
        <span className="rounded-md bg-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 ">
          Metrics • Settings • Permissions
        </span>
                <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ol className="grid gap-2 text-sm text-neutral-700 md:grid-cols-2">
          <li className="rounded-md bg-white px-3 py-2 shadow-sm">
            <span className="font-medium">Dataset statistics</span>
            <p className="mt-1 text-xs text-neutral-600">
              View high-level details about the dataset used to train the
              predictor.
            </p>
          </li>
          <li className="rounded-md bg-white px-3 py-2 shadow-sm">
            <span className="font-medium">Feature correlations</span>
            <p className="mt-1 text-xs text-neutral-600">
              Inspect correlation plots to understand feature relationships.
            </p>
          </li>
          <li className="rounded-md bg-white px-3 py-2 shadow-sm">
            <span className="font-medium">
              Event time &amp; predicted survival histograms
            </span>
            <p className="mt-1 text-xs text-neutral-600">
              Compare observed event times with predicted survival outputs.
            </p>
          </li>
          <li className="rounded-md bg-white px-3 py-2 shadow-sm">
            <span className="font-medium">Advanced settings &amp; CV</span>
            <p className="mt-1 text-xs text-neutral-600">
              Review advanced training options and cross-validation results.
            </p>
          </li>
        </ol>
      </div>
    </details>
  </section>
</section>

{/* Using Predictors */}
<section id="using-predictors" className="scroll-mt-24 space-y-4">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-3xl font-bold text-neutral-900">
        Using Predictors
      </h2>
      <p className="mt-1 text-base text-neutral-600">
        Run survival predictions and quickly find the models you need.
      </p>
    </div>
  </div>

  {/* Make Predictions */}
  <section id="use-predictor" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Make Predictions
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Use a trained predictor to generate survival predictions.
          </span>
        </div>
        <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <p className="mb-3 text-sm text-neutral-700">
          Navigate to the <Link to="/use-predictor" className="text-blue-600 underline font-medium">Use Predictor</Link> page to run predictions. Follow the guided three-step workflow:
        </p>
        <ol className="space-y-3 text-sm text-neutral-700">
          <li className="rounded-md bg-neutral-50 px-3 py-2">
            <span className="font-medium">Step 1: Select a Trained Predictor</span>
            <ul className="mt-1 ml-4 space-y-1 text-xs text-neutral-600">
              <li>• Choose from your trained predictors in the dropdown</li>
              <li>• View predictor details including model type, training dataset, and required features</li>
              <li>• Only predictors with "Trained" status are available</li>
            </ul>
          </li>
          <li className="rounded-md bg-neutral-50 px-3 py-2">
            <span className="font-medium">Step 2: Select a Dataset</span>
            <ul className="mt-1 ml-4 space-y-1 text-xs text-neutral-600">
              <li>• Pick any dataset from your available datasets</li>
              <li>• Preview the first 10 rows to verify your data</li>
              <li>• The system automatically validates feature compatibility</li>
              <li>• If the dataset has "time" and "censored" columns, they'll be ignored for prediction. </li>
            </ul>
          </li>
          <li className="rounded-md bg-neutral-50 px-3 py-2">
            <span className="font-medium">Step 3: Review & Run Prediction</span>
            <ul className="mt-1 ml-4 space-y-1 text-xs text-neutral-600">
              <li>• Check the feature validation results</li>
              <li>• "Run prediction" button enables only when features match exactly</li>
              <li>• If features don't match, you'll see a feature mismatch error</li>
              <li>• After running, you'll be prompted to save your prediction results</li>
            </ul>
          </li>
        </ol>
        <div className="mt-3 rounded-md bg-neutral-50 border border-neutral-900 px-3 py-2 text-xs text-neutral-900">
          <p className="font-medium">Tip</p>
          <p className="mt-1">All successful predictions are automatically saved to <Link to="/my-predictions" className="text-blue-600 underline font-medium">My Predictions</Link> where you can review results, download data, and visualize survival curves.</p>
        </div>
      </div>
    </details>
  </section>

  {/* Filtering & Search */}
  <section id="filter-search" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Filtering &amp; Search
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Quickly find specific datasets, predictors, or folders.
          </span>
        </div>
        <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            • Use the search bar on the Dashboard to match by title or notes.
          </li>
          <li>
            • Apply filters (ownership, updated within, etc.) to narrow down large
            collections.
          </li>
          <li>
            • For folders, filter by type (predictors, datasets, mixed) and sort
            by name or recency.
          </li>
        </ul>
      </div>
    </details>
  </section>
</section>

{/* Help & Support */}
<section id="help" className="scroll-mt-24 space-y-4">
  <div className="flex items-center justify-between gap-4">
    <div>
      <h2 className="text-3xl font-bold text-neutral-900">
        Help &amp; Support
      </h2>
      <p className="mt-1 text-base text-neutral-600">
        Fix common issues and understand key survival analysis terms.
      </p>
    </div>
  </div>

  {/* Troubleshooting */}
  <section id="troubleshooting" className="scroll-mt-24">
    <details className="group rounded-lg border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Troubleshooting
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Quick checks before you email for help.
          </span>
        </div>
        <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            • Ensure your datasets do not contain missing values; otherwise
            verification will fail.
          </li>
          <li>
            • Double-check that your file format is supported and column names
            match expectations.
          </li>
          <li>
            • If issues persist, contact the{" "}
            <a
              href="mailto:rgreiner@ualberta.ca,asgarian@ualberta.ca"
              className="text-blue-600 underline"
            >
              administrators
            </a>{" "}
            with a short description and (if possible) example data.
          </li>
        </ul>
      </div>
    </details>
  </section>

  {/* Glossary */}
  <section id="glossary" className="scroll-mt-24 mb-10">
    <details className="group rounded-lg border border-neutral-200 bg-neutral-50">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-semibold uppercase tracking-wide text-neutral-800">
            Glossary
          </span>
          <span className="mt-0.5 text-xs text-neutral-600">
            Key terms you’ll see throughout the site and documentation.
          </span>
        </div>
        <span className="text-xl text-neutral-500 transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="border-t border-neutral-200 px-4 pb-4 pt-3">
        <ul className="space-y-1.5 text-sm text-neutral-700">
          <li>
            <strong>ISD</strong> – Individual Survival Distributions.
          </li>
          <li>
            <strong>Uncensored Data</strong> – Survival time that fully captures
            a patient’s entire lifespan (complete data).
          </li>
          <li>
            <strong>Censored Data</strong> – Incomplete survival information
            that only provides a lower bound on lifespan; common in survival
            datasets.
          </li>
          <li>
            <strong>KM Curve (Kaplan–Meier)</strong> – A standard estimator of
            the survival function used for comparison.
          </li>
        </ul>
      </div>
    </details>
  </section>
</section>

 </div> </main> </div> </section> ); }
