# Introduction
Spreadsheets based on django models and django rest framework.

# Setup
`make setup`

# Run
`make run`

# Open browser
`make open-browser`

# Testing
`make test`

# Bookkeeping example
A second example project in `bookkeeping/` with customers, invoices,
invoice items and timesheets, in its own database (`bookkeeping.sqlite3`)
on port 8001. It shows protected deletes (a customer with invoices),
cascades (items go with their invoice) and nullable references
(timesheets are unbilled when their invoice is deleted).

```
make setup-bookkeeping   # database, demo data and the superuser from config.mk
make run-bookkeeping     # http://localhost:8001
make test-bookkeeping
```

# Todo
## Access limitations
Should this be done here or handled elsewhere?
## Sorting
Sorting in combination with paging.
## Paging
Load only x records at start, add when scrolling.
## Auto update on change
Don't require a click to update 
## Auto add when required columns are filled
Don't require a click to add
## Sticky table header
Keep header in viewport when scrolling
## Switch to es6
## No jquery

