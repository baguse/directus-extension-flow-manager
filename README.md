# directus-extension-flow-manager
This directus module extension allows you to manage your flow content from directus.

You can install it via ``npm install directus-extension-flow-manager``

- [x] Duplicate flow
- [x] Export and import flow
- [x] Add flow validation when Restore
- [x] Feature for keeping original flow id when restore
- [x] Add flow grouping
- [x] Add feature to import directly to another directus instance

Screenshoots
![Latest Screenshot](https://raw.githubusercontent.com/baguse/directus-extension-flow-manager/253b1a1418f70b628fa4c742e9ba22ab864d5786/screenshoots/Screenshot_20240317_123438.png)

Changelogs:
- 1.0.0: (13 July 2023)
  * Initial release
- 1.1.0: (21 July 2023)
  * Add Backup and Restore feature
  * Allow user to click the flow row and bring to flow detail page
- 1.1.1: (02 August 2023)
  * Add flow validation on restore
- 1.2.1: (14 September 2023)
  * Add feature for keeping original flow id when restore
  * Add New flow name textfield on restore confirmation dialog
- 1.2.2: (22 September 2023)
  * Add flow grouping
- 1.2.3: (13 November 2023)
  * Add feature to import directly to another directus instance
    You need to install the `directus-extension-flow-manager-endpoint` to use this feature
- 1.3.0: (17 March 2024)
  * Add feature for search flow on navigation
    You can search flow by name and your search text will be highlighted and automatically expanded the category
    Note: Current expanded category will be stored on local storage
  * Fix deep child flow logic when drag and drop
    In this version you can unlimitedly drag and drop your flow to another flow or category
  * Add trigger type on flow row
    You can see the trigger type on the flow row
    - `MANUAL` : Flow that can be triggered manually
    - `OPERATION` : Flow that can be triggered by another flow
    - `SCHEDULE` : Flow that can be triggered by schedule
    - `ACTION` : Flow that can be triggered by Event hook
    - `WEBHOOK` : Flow that can be triggered by Webhook
  * Add button to go to the directus flow detail page
    You can click the flow row and it will bring you to the directus flow detail page
  * Add option to delete the flow
    You can delete the flow by clicking the delete button on the flow row option or the navigation context menu
If you want to contribute kindly to create a PR and if you want to request a feature or report of a bug kindly create the Issue
