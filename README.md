# Library Book Finder

This tool helps you search for books across multiple libraries using Overdrive's system. It shows availability, wait times, and direct links to each book. Features include colorized output, rate limiting protection, library preferences, and the ability to export search results.

## Installation

1. Unzip the library-finder.zip file
2. Install Node.js if you haven't already (download from https://nodejs.org/)
3. Open your terminal and navigate to the unzipped directory:
   ```bash
   cd library-finder
   ```
4. Install required packages:
   ```bash
   npm install node-fetch chalk@4 rate-limiter-flexible
   ```
5. Add these functions to your shell:
   For bash/zsh users, add to ~/.bashrc or ~/.zshrc:
   ```bash
   # Library search functions
   function libsearch() {
       cd PATH_TO_LIBRARY_FINDER && node library-search.js "$@"
   }
   
   function libsearch-ebook() {
       cd PATH_TO_LIBRARY_FINDER && node library-search.js "book" "$@"
   }
   
   function libsearch-audio() {
       cd PATH_TO_LIBRARY_FINDER && node library-search.js "audiobook" "$@"
   }
   ```
   Replace PATH_TO_LIBRARY_FINDER with the actual path where you unzipped the files.
   
6. Reload your shell:
   ```bash
   source ~/.bashrc  # or source ~/.zshrc for zsh users
   ```

## Usage

Search for any format:
```bash
libsearch "Book Title"
```

Search for ebooks only:
```bash
libsearch-ebook "Book Title"
```

Search for audiobooks only:
```bash
libsearch-audio "Book Title"
```

The results will show:
- Available copies at different libraries
- Wait times and hold counts for unavailable copies
- Direct links to check out or place holds

## Files Included
- library-search.js: Main search script
- libraries.template.json: Template for library configuration
- preferences.json: User preferences and favorite libraries
- README.md: This instruction file
- package.json: Node.js dependencies

## Features

### Colorized Output
- Green for available books
- Yellow for waitlist information
- Blue for clickable URLs
- Red for errors

### Library Preferences
Edit `preferences.json` to:
- Set favorite libraries (shown first in results)
- Configure library nicknames
- Set default search preferences
- Customize export settings

### Export Results
Export your search results to JSON or CSV:
```bash
# Export as JSON
node library-search.js "Book Title" --export json

# Export as CSV (compatible with Excel/Google Sheets)
node library-search.js "Book Title" --export csv
```

Results are saved in the `search-results` directory with timestamps.

## Setup
1. Create your libraries.json:
   ```bash
   cp libraries.template.json libraries.json
   ```
2. Edit libraries.json to include your preferred libraries
3. Customize preferences.json to set your favorite libraries and export preferences

## Notes
- Your libraries.json will not be tracked in git to protect your library list
- Rate limiting is enabled to prevent API throttling
- Export results can be opened in spreadsheet applications for further analysis
