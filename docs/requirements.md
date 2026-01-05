# Project Requirements

## Executive Summary

EZ Survival Prediction is best described as a brownfield project with large patches of green. To be precise, it is based on the existing PSSP site. The current website is 7–8 years old, slow, and difficult to navigate, and the existing tools for learning and evaluating ISD models are slow, cumbersome and lack extensive features. 

Our product will let machine learning researchers and other practitioners in the relevant fields upload survival datasets, train survival models with adjustable parameters using various learning tools, evaluate the models using various metrics and run predictions on new unlabeled instances, and obtain Individual Survival Distributions (ISDs) for new instances. The system will also allow the secure storage, search, and evaluation of datasets and models. 

Users will be able to:

* Upload a survival dataset (spreadsheet format) and train a survival model with adjustable parameters.

* View cross-validation and other evaluation metrics for the learned model.

* Run the trained model on new, unlabeled instances to obtain ISD predictions (time-probability distributions).

Our target users include medical researchers and clinicians, engineers, finance managers, and insurance agents who are familiar with spreadsheets but not with programming.

The system is web-based, initially running in a browser (focus on Chrome). If time permits, it may also be packaged as an Excel/G-Sheet/SPSS add-on.


## Project Glossary

* **ISD** - Individual Survival Distributions 

* **User** - A non-logged-in user. Can view public datasets.

* **LIU** - A logged-in user. Can view all public datasets, and any private datasets they are permitted to view. Can also upload new datasets and train models.

* **Superuser** - Admin with permission to view high-level statistics across all datasets/models (public and private). 

* **Uncensored Data** - Survival time that fully captures the patient’s entire lifespan (i.e., complete data).

* **Censored Data** - Incomplete survival time information, representing only a lower bound of a patient’s lifespan. Prevalent across datasets and an issue addressed by the client's research.

* **KM Curve (Kaplan-Meier)** - A standard survival function estimate used for comparisons.


## User Stories

User stories must be prioritized using the MoSCoW method.

### 1. User Access 

#### US 1.1 - User Logging in / Out
> SP: 3

> As a user, I want to log in and log out using my Google account, so that I can save my datasets and predictions. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can click the button "Sign In With Google Account", or alternatively enter a gmail address, followed by a password<br>

2. User is prompted with a pop-up to choose their Google Account<br>

3. User cannot sign up without a Google Account; the entered email is flagged if it is not a gmail account<br>

4. User cannot enter a password that is shorter than a certain character limit, or if it doesn't contain the at least one number or special character<br>

</details><br> 

>> #### US 1.1.1 - Change Password
>> SP: 1

>>> As a user, I want to be able to change my password, so that I can keep my account secure.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can click their Profile and access the Settings page<br>

2. User is prompted to change their password<br>

3. User cannot change their password to the same password<br>

4. User cannot enter a password that is shorter than a certain character limit, or if it doesn't contain the at least one number or special character<br>

</details><br> 

#### US 1.2 - Superuser / Admin Logging In / Out
> SP: 1

> As a Superuser/Admin, I want to log in and log out using my UAlberta credentials, so that I can view others' datasets and predictions. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User is given the option to sign in using their UAlberta credentials Google Account<br>

2. User is validated in the database to be a Superuser/Admin<br>

3. User is given access to a separate Superuser/Admin tab<br>

4. With this tab, the Superuser/Admin can view all datasets and select them to view predictions<br>

</details><br> 

#### US 1.3 - Logged-In User Dashboard
> SP: 3

> As a user, I want to be able to see all of my created predictors and folders, so that I can edit or use them.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can navigate to their Dashboard once logged in<br>

2. User cannot access the Dashboard if they are not logged in<br>

3. Users can view all their created predictors and folders<br>

4. User can select existing predictors and folders, which will provide options to edit or delete them<br>

5. User can click on a button that lets them create a new predictor<br>

</details><br> 

>> #### US 1.3.1 - Upload a Dataset
>> SP: 3

>>> As a user, I want to upload a dataset and verify it is formatted correctly, so that I can avoid errors in model training. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can navigate to an "upload dataset" button<br>

2. User can upload their dataset using a file upload for .csv files<br>

3. Tests to ensure all columns / rows are formatted in accordance to the machine learning model's requirements<br>

4. User is prompted with the detected errors, if there are any<br>

5. User is allowed to continue if no errors are detected<br>

</details><br> 

>> #### US 1.3.2 - Upload Formatted Datasets
>> SP: 3

>>> As a user, I want to upload input data as spreadsheets and .csv files, so that it's easier to upload and use. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can upload .csv files using an "upload dataset" button<br>

2. Website will validate and ensure the file is formatted properly<br>

</details><br> 

>> #### US 1.3.3 - Predictor Privacy
>>> SP: 2

>>> As a user, I want to be able to make a dataset / predictor private or public, so that I can control its access. 

<details>
<summary>Acceptance Tests</summary><br> 

1. When uploading or viewing their datasets / predictors, user can select privacy<br>

2. A logged out user can only see public datasets / predictors<br>

3. A logged in user can only see public datasets / predictors and private predictors for which they are a selected user<br>

</details><br> 

>>> #### US 1.3.3.1 - Share Private Predictors
>>>> SP: 5

>>>> As a user, I want to be able to decide which users can view my private predictor, so that I can let them use it too.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can add accounts to share datasets / predictors with while creating or editing them<br>

</details><br> 

>>> #### US 1.3.3.2 - (Optional) - Manage User Permissions on Private Predictor
>>>> SP: 5

>>>> As a user, I want to be able to decide which users can view my private predictor, so that I can let them use it too.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can add accounts to share datasets / predictors with while creating or editing them<br>

</details><br> 

>> #### US 1.3.4 - Create a Predictor
>>> SP: 3

>>> As a user, I want to be able to create a predictor using a dataset i.e. train a model on my dataset, so that I can save it and view its predictions.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can create a predictor after uploading a dataset<br>

2. User can name it, add notes, toggle visibility and permissions, add it to a folder, or modify some advanced settings<br>

3. Required fields not being filled in will result in creation failure<br>

4. The name being the same as another existing predictor will also lead to creation failure<br>

</details><br> 

>> #### US 1.3.5 - Edit a Predictor
>>> SP: 3

>>> As a user, I want to be able to edit the details of my predictor (such as the notes, the dataset, and other settings), so that I can make it better.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can select an existing predictor owned by them to edit<br>

2. User can edit its name, notes, toggle visibility and permissions, add it to a folder, or modify some advanced settings<br>

3. Required fields being removed will result in a save failure<br>

4. User cannot select an existing predictor not owned by them to edit<br>

</details><br> 

>> #### US 1.3.6 - Delete a Predictor
>>> SP: 1

>>> As a user, I want to be able to delete a predictor I have made, so that I can get rid of bad or unwanted models.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can select an existing predictor owned by them to delete<br>

2. User will be taken to a confirm popup where they can cancel the delete operation or continue<br>

3. Deletion will result in the predictor no longer being visible / removed from the database<br>

4. Canceling deletion will lead to nothing happening<br>

5. User cannot select an existing predictor not owned by them to delete<br>

</details><br> 

>> #### US 1.3.7 - Pin Predictors
>>> SP: 2

>>> As a user, I want to be able to pin predictors, so I can easily access them without needing to search them up.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can select any predictor to pin<br>

2. Pinned predictor will be added to a side panel<br>

3. Pinned predictor can be accessed from the panel by the user<br>

4. Pinned predictor can be can unpinned by the user - this will lead to it being removed from the side panel<br>

5. The three universally pinned predictors will exist on top<br>

6. The three universally pinned predictors cannot be deleted<br>

</details><br> 

>> #### 1.3.8 (Optional) - Save My Draft Predictors
>>> SP: 3

>>> As a user, I want to be able to save my progress when I work on creating new predictors - essentially, I can create drafts - so that I can work on them incrementally and save my progress in case of a crash / Wi-Fi cut.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can start creation process<br>

2. User can save the draft created - only needs to have the Name field filled in<br>

3. Draft predictors are private by default - they do not show up on the Predictors tab, only on the user's Dashboard<br>

4. Draft predictors are automatically deleted after some time<br>

5. Draft predictors can be edited or deleted like regular predictors<br>

</details><br> 

#### US 1.4.1 - Display Predictors
> SP: 2

> As a user, I want to be able to see all public and private predictors (that I have the permissions to view or edit), so that I can decide which ones to work with.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can view all public / private (if permitted) predictors on the Predictors page<br>

</details><br> 

>> #### US 1.4.2 - Search for a Dataset / Predictor
>>> SP: 3

>>> As a user, I want to search for a stored dataset/predictor that I have created or been granted access to, so that I can use it for my own predictions. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can search for datasets / predictors using the search tab<br>

2. User can select and view queried datasets<br>

</details><br> 

>> #### US 1.4.3 - Filter Predictors By Public / Private
>>> SP: 1

>>> As a user, I can filter predictors by whether they are public or private, so that it is easier to view or work with.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can filter predictors by whether they are public or private<br>

2. Checking off either one causes the other to vanish from the Predictors page<br>

3. Checking off both leads to the default view<br>

4. User can select and view queried datasets<br>

</details><br> 

#### US 1.5 
> SP: 8

> As a Superuser/Admin, I want to be able to view all of the public/private datasets/models, so that I can collect general statistics regarding model training and usage. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can search through all datasets<br>

2. Statistics are automatically collected by the admin panel settings<br>

3. User can log into the admin panel and view, modify or delete entries across the website<br>

</details><br> 

#### US 1.6.1
> SP: 2

> As a user, I want to be able to create folders, so that I can organize my predictors (and datasets) better.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can create a folder once they have named it<br>

2. User can expand or minimize a folder<br>

3. User can rename a folder they have created<br>

</details><br> 

>> #### US 1.6.2 - Delete Folders
>>> SP: 1

>>> As a user, I want to be able to delete folders I have created, so that I can organize my predictors (and datasets) better.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can delete a folder they have created<br>

2. Upon deletion, the folder disappears. Its contents are not deleted<br>

3. User cannot delete a folder not created by them<br>

</details><br> 

>> #### US 1.6.3 - Toggle Folder Visibility
>>> SP: 5

>>> As a user, I want to be able to set folders to public and private, so that I can control who sees my predictors.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can set a folder to public or private<br>

2. Folders have their own privacy toggle. Only becomes private if EVERY predictor in it is marked off private<br>

3. If a folder is marked private and its contents are public, they are all private on the Predictors page, but the predictors still show up on the Predictors page<br>

4. If a folder is marked public and most of its contents are private, only the public predictors are shown in the folder on the Predictors page<br>

</details><br> 

>> #### US 1.6.4 - Move Predictors Between Folders
>>> SP: 5

>>> As a user, I want to be able to drag and drop predictors into folders, so that it's easy to organize everything.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can drag predictors into and out of folders<br>

2. Visual updates and database updates should be quick and 'persist' onscreen<br>

3. If the operation fails for any reason, an error message should flash and the predictor should go back to its original place<br>

</details><br> 

#### US 1.7 - Landing Page
> SP: 2

> As a user, I want to be able to access the landing page the moment I open the website, so I can quickly navigate anywhere.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can navigate to the Landing Page<br>

</details><br> 

#### US 1.8 - About Page
> SP: 2

> As a user, I want to be able to read about the PSSP website, the research behind the tools available, and those who worked on it, so I can better understand what the purpose of the website is.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can navigate to the About Page<br>

2. User can navigate to the hyperlinked pages from the About page and view graphics<br>

</details><br> 

### 2. Interface

#### US 2.1.1 (Optional) - Recommendation System
> SP: 8

> As a user, I want an interface that allows me to identify an accessible dataset, a specific learning tool, and a specification of that learner’s hyperparameter, so that I can save time in choosing manually. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can see available learning tools on a dataset's information page<br>

2. Interface displays information about which learning tool was used for each dataset<br>

</details><br> 

>> #### US 2.1.2 
>>> SP: 3

>>> As a user, I want to run this specific learner on that dataset, and save the resulting trained model securely, so that I can save my runs. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can select learners for different datasets<br>

2. System automatically saves trained models in "versions"<br>

3. User can access different versions of learners on the dataset's page<br>

</details><br> 

>> #### US 2.1.3 - Re-Train Predictors
>>> SP: 2

>>> As a user, I want to be able to retrain predictors on subsets of features, so I can improve its predictions.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can retrain predictors<br>

2. Interface updates with a visual confirmation of training, and the success / failure<br>

</details><br> 

>>> #### US 2.1.3.1 - Search for Features
>>>> SP: 2

>>>> As a user, I want to be able to search for features in a list of them, so that I can select and deselect them as needed without needing to scroll through hundreds of them.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can click on the search bar and search for specific features based on name<br>

2. If the substring matches, results are pulled up - the table size reduces to accomodate queried results<br>

</details><br> 

>>> #### US 2.1.3.2 - Select and Deselect All Features
>>>> SP: 2

>>>> As a user, I want to be able to deselect and select all features at a button's click, so I don't have to do this manually.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can click on the Select All button to select all features onscreen and beyond<br>

2. User can click on the Deelect All button to deselect all features onscreen and beyond<br>

2. If there are none onscreen due to searches, this will fail with an error message<br>

</details><br> 

>>> #### US 2.1.3.3 - Paginate Features
>>>> SP: 2

>>>> As a user, I want to be able to decide how many feature entries exist on one page and navigate through the pages, so that I don't have to view hundreds of them at once.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can click on the Entries Per Page box and enter / increase or decrease the number per page [using the arrows]<br>

2. User can navigate pages using arrow buttons, and see what page they are at<br>

2. Arrows do not exist to go beyond the last page of results or befor ethe first.<br>

</details><br> 

#### US 2.2 - Implement Learning Tools
> SP: 5-8

> As a user, I want the website to include several learning tools, each with its own set of parameters, so I can save time generating separate predictions for each metric. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can select betwen different learning tools on dataset information page<br>

2. Website displays all learning tools with their own required parameters<br>

</details><br> 

#### US 2.3 
> SP: 8

> As a user, I want the interface to show the show the (cross-validation) evaluation of the quality of this learned model, in terms of several metrics, so that I can cross-validate. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can see cross-validation evaluation for learned models on a dataset information page<br>

2. User can view a variety of metrics of the model's cross-validation<br>

</details><br> 

### 3. Running

#### US 3.1 - Run Predictors on Unlabeled Data
> SP: 2

> As a user, I want to run an accessible learned survival model on one or more unlabeled instances, so that I can generate predictions using my trained models. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can run learned survival models on unlabeled instances using the database information page<br>

</details><br> 

#### US 3.2 - Prediction Display Formats
> SP: 5

> As a user, I want to receive predictions as ISD, like perhaps a graph of [time, probability] pairs, so that I can store them easily. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can view ISD predictions on the prediction information page<br>

2. User can view generated graphs and tweak graph settings<br>

3. User can easily download and store graphs<br>

</details><br> 

#### US 3.3 - Quality Evaluation of Predictors
> SP: 3

> As a user, I want facilities for showing the quality of an accessible learned model, on a held-out (labelled) dataset, in terms of several metrics, so that I can understand outputted predictions easily. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can view all metrics of learned models on the prediction information page<br>

</details><br> 

#### US 3.4 - Dataset Metrics / Analysis
> SP: 3

> As a user, I want #features, #instances and censor rate for each dataset, so that I can evaluate my uploaded dataset more easily. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can view the features, instancse, and censor rates for each dataset on the dataset information page<br>

</details><br> 

#### US 3.5 - Print Results
> SP: 2

> As a user, I want to be able to print diagrams or predictions, so that I can store them or use them.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can print diagrams or statistics using the print option<br>

2. User can toggle diagrams or statistics for printing using toggles - they will be formatted nicely in the print screen view<br>

</details><br> 

#### US 3.6 - Download Results
> SP: 2

> As a user, I want to be able to download my results, so that I can save them on my local device.

<details>
<summary>Acceptance Tests</summary><br> 

1. User can download diagrams or statistics using the dowload option<br>

2. User can find downloaded materials in their Downloads directory on their local device.<br>

</details><br> 

#### US 3.7 - Superuser-Specific Analysis Tools
> SP: 5

> As a Superuser/Admin, I want to be able to view and analyze others' datasets, so that I can understand general usage. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can view others' dataset usage on an admin panel<br>

2. User can view all dataset usage statistics<br>

</details><br> 

### 4. Documentation 

#### US 4.1.1 - Instructions Page
> SP: 1

> As a user, I want instructions and a tutorial on how to use the website, so that I can easily navigate the website. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User will be able to watch a guided video on the "help" page of the website<br>

2. User will also be able to read more detailed instructions on this help page<br>

</details><br> 

>> #### US 4.1.2 - Hover Over Buttons / Tabs for Info
>>> SP: 2

>>> As a user, I want to be able to see what a button does or page shows by hovering over it, so I can navigate the website and use its tools more effectively.

<details>
<summary>Acceptance Tests</summary><br> 

1. User will be able to hover over buttons<br>

2. User will also be able to read the text on the popup that appears which will explain what the button or page does<br>

</details><br> 

#### US 4.2 - Guided Tour / Demo Implementation
>>> SP: 3

> As a user, I want a guided tour, so that I can get familiar using the different features and models on the website. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User will be prompted to start a guided tour when visiting the website for the first time on their google account<br>

2. Various buttons and sections of the website will be highlighted<br>

3. Text will describe what each section is for and how to use it<br>

</details><br> 

### 5. Confirmed Optional Features

#### US 5.1 - PSSP Package Download
> SP: 8

> As a user, I want the website to also be an add-on package for excel, SPSS, so that I may use it directly from my spreadsheets. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User will be able to download an excel/SPSS add-on from their respective tooling services

2. The add-on will assist in displaying information to the user

</details><br> 

#### US 5.2 - Handle Censored Data
> SP: 8

> As a user, I want to an active budgeted learning for “de-censoring”, and dealing with left and interval-censoring, so that I may generate more precise predictions. 

<details>
<summary>Acceptance Tests</summary><br> 

1. User can change specific settings regarding "de-censoring"<br>

2. User can generate more precise predictions by specifying censoring information<br>

</details><br> 


## MoSCoW

### Must Have
US 1.1 - User Logging in / Out

US 1.2 - Superuser / Admin Logging In / Out

US 1.3 - Logged-In User Dashboard

US 1.3.1 - Upload a Dataset

US 1.3.3 - Predictor Privacy

US 1.3.3.1 - Share Private Predictors

US 1.3.4 - Create a Predictor

US 1.3.5 - Edit a Predictor

US 1.3.6 - Delete a Predictor

US 1.4.1 - Display Predictors

US 1.4.2 - Search for a Dataset / Predictor

US 1.5 - Superuser / Admin Access (Panel Set-Up)

US 1.8 - About Page

US 2.1.2 - Save Predictors After Runs

US 2.1.3 - Re-Train Predictors

US 2.1.3.1 - Search for Features

US 2.1.3.2 - Select and Deselect All Features

US 2.2 - Implement Learning Tools

US 2.3 - Cross-Validation Evaluation of Predictor

US 3.1 - Run Predictors on Unlabeled Data

US 3.2 - Prediction Display Formats

US 3.3 - Quality Evaluation of Predictors

US 3.4 - Dataset Metrics / Analysis

US 3.7 - Superuser-Specific Analysis Tools

US 4.1.1 - Instructions Page

US 4.1.2 - Hover Over Buttons / Tabs for Info


### Should Have
US 1.1.1 - Change Password

US 1.3.2 - Upload Formatted Datasets

US 1.3.7 - Pin Predictors

US 1.4.3 - Filter Predictors By Public / Private

US 1.6.1 - Create Folders

US 1.6.2 - Delete Folders 

US 1.6.3 - Toggle Folder Visibility

US 1.6.4 - Move Predictors Between Folders

US 1.7 - Landing Page

US 2.1.3.3 - Paginate Features

US 3.5 - Print Results

US 3.6 - Download Results

US 4.2 - Guided Tour / Demo Implementation


### Could Have
US 1.3.8 - Save My Draft Predictors


### Would Like But Won't Get
US 2.1.1 - Recommendation System

US 5.1 - PSSP Package Download

US 5.2 - Handle Censored Data<br>





## Similar products

1. <a href="https://mlconsole.com/" target="_blank">ML Console</a>
> * Builds AI models by using uploaded dataset
> * Secure data and predictions
> * Used for inspiration to produce model predictions

2. <a href="https://voxel51.com/landing/ml-datasets?utm_source=google&utm_medium=search&utm_campaign=ML_Datasets&utm_term=ml%20datasets&device=c&utm_source=google&utm_medium=cpc&utm_campaign=22835379762&utm_term=ml%20datasets&utm_content=184661742362&hsa_acc=7373578919&hsa_cam=22835379762&hsa_grp=184661742362&hsa_ad=766399187256&hsa_src=g&hsa_tgt=kwd-532915517679&hsa_kw=ml%20datasets&hsa_mt=p&hsa_net=adwords&hsa_ver=3&gad_source=1&gad_campaignid=22835379762&gbraid=0AAAAApQT94lRAgU_hSN23gQFoPXlkvTA6&gclid=Cj0KCQjw_rPGBhCbARIsABjq9ccSlWcC4PbVUiUcXcZKopEP72HyRifrKWRV_4DKS-1pqOuR8_NWuD4aAmaZEALw_wcB" target="_blank">FiftyOne</a> 
> * Identifies edge cases, outliers, duplicates and mislabeled samples
> * Visualizes images, video, 3D in an interactive UI
> * Used for inpiration to clean the dataset before conducting predictions

3. Other survival analysis libraries (R survival, Python lifelines) for algorithm inspiration.
> * Used commonly but not nearly as user-friendly for non-tech-based professionals who may want to conduct further resarch in the field
> * Functionality may be of interest to us for the development of the backend, as stated

4. Kaplan–Meier online calculators (various web tools) as an inspiration for practical implementation techniques.<br>
> * Similar issue - used commonly but not nearly as user-friendly for non-tech-based professionals who may want to conduct further resarch in the field, but in the sense that it is only as insightful as the user knows it to be.
> * May be of interest to us for the development of how to display results on the frontend


## Open-source products

1. <a href="https://github.com/shi-ang/SurvivalEVAL" target="_blank">MAE-PO (SurvivalEVAL)</a>

2. <a href="https://github.com/shi-ang/MakeSurvivalCalibratedAgain" target="_blank">CSD/CiPOT (MakeSurvivalCalibratedAgain)</a>

3. <a href="https://github.com/shi-ang/BNN-ISD" target="_blank">BNN-ISD</a>

## Technical resources

### Brownfield Documentation
>- <a href="https://docs.google.com/document/d/1DmFf9IDluLoiTbr6PEhBdytxpxbRrxwnVw2zilON0GE/edit?usp=sharing" target="_blank">PSSP User Guide</a> (provided by client) 
>- <a href="https://papers.nips.cc/paper_files/paper/2011/file/1019c8091693ef5c5f55970346633f92-Paper.pdf" target="_blank">NIPS paper on Cancer Research</a>
>- Presentations and papers on the research being supported by the project. (provided by client)
>- 

### Backend: 

Ruby on Rails + C++ / R; MySQL

### Frontend: 

React / Vite + TypeScript + Tailwind CSS + Zustand + React Router

### Deployment:

TBD - to be communicated to us by the client at a later date