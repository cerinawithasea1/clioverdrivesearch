# Library Book Finder 🚀

A supercharged command-line tool to search multiple libraries simultaneously for books and audiobooks using OverDrive's system. Get real-time availability, waitlist times, and direct links across thousands of libraries worldwide!

## 🎉 NEW ENHANCED FEATURES (September 2025)

### 📊 **Comprehensive Library Database**
- 🌍 **1,179 Live Libraries** from comprehensive OverDrive dataset
- 🏛️ **221 Consortiums** + **958 Individual Libraries** 
- 🔍 **Rich Metadata** including features, links, and capabilities

### 📈 **Library Discovery Commands**
```bash
libsearch --stats                    # View library statistics dashboard
libsearch --library-info "Seattle"   # Find detailed library information
```

### ⚡ **Enhanced Library Features Detection**
- **Instant Access**: 53 libraries support immediate borrowing
- **Lucky Day**: 333 libraries offer lucky day collections  
- **Deep Search**: 1,034 libraries support advanced search
- **Direct Links**: Website URLs and card acquisition links

## ✨ SUPERCHARGED Features

🆕 **NEW: Dynamic Library Discovery** - No more manual configuration!
- 🌍 **Access to ALL OverDrive libraries worldwide** (11,000+ libraries!)
- ⚡ **Smart caching system** for blazing-fast startup
- 🔄 **Auto-refresh** library index with `--refresh-libs`
- 🎯 **Library limiting** with `--max-libs` for testing

🎨 **Enhanced Search Experience**:
- Green for available books
- Yellow for waitlist information  
- Blue for clickable URLs
- Red for errors

🚦 **Built-in Protection**:
- Rate limiting to prevent API throttling
- Intelligent error handling
- Safe delays to avoid account flagging

⭐ **Smart Features**:
- Favorite libraries appear first in results
- Export results as JSON or CSV
- Template-based configuration for privacy

## Installation

1. Clone this repository
2. Install Node.js if you haven't already (download from https://nodejs.org/)
3. Navigate to the project directory:
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
   Replace PATH_TO_LIBRARY_FINDER with the actual path to this directory.
   
6. Reload your shell:
   ```bash
   source ~/.bashrc  # or source ~/.zshrc for zsh users
   ```

## Usage

### Basic Search Commands

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

### 🆕 Dynamic Library Features

**Automatic OverDrive Library Discovery** - No more manual library configuration!

Refresh the OverDrive libraries index:
```bash
libsearch --refresh-libs
```

Search with library limit (great for testing):
```bash
libsearch --max-libs 50 "Book Title"
```

Combine flags:
```bash
libsearch --refresh-libs --max-libs 100 "Book Title" --export json
```

The results will show:
- Available copies at different libraries
- Wait times and hold counts for unavailable copies
- Direct links to check out or place holds
- 📚 Searches ALL OverDrive libraries automatically!

## Files Included
- **library-search.js**: Enhanced main search script with new features
- **libraries_detailed.json**: Comprehensive OverDrive library database (1,179 libraries)
- **libraries_simple.json**: Simplified library list for fallback
- **libraries.api.cache.json**: Dynamic API cache for live library discovery
- **libraries.template.json**: Template for library configuration  
- **preferences.json**: User preferences and favorite libraries
- **README.md**: This instruction file
- **package.json**: Node.js dependencies

### 📁 **Library Data Files**

The tool now supports multiple data sources with intelligent fallback:

1. **libraries_detailed.json** (Primary): Complete metadata from OverDrive API
   - Full library information including features and links
   - Consortium vs individual library classification
   - Service capabilities (Instant Access, Lucky Day, etc.)

2. **libraries_simple.json** (Fallback): Basic library information
   - Essential data for search functionality
   - Used if detailed data fails to load

3. **libraries.api.cache.json** (Dynamic): Live API cache
   - Real-time library discovery from OverDrive
   - Auto-refreshed with `--refresh-libs` flag

## Features

- 🎨 **Colorized output** for easy reading
- 🔍 **Search by format** (ebook, audiobook, or both)
- ⏱️ **Show available copies and wait times**
- 📊 **Export results** as JSON or CSV
- 🚦 **Rate limiting protection**
- ⭐ **Support for favorite libraries** (show results first)
- 🔐 **Template-based configuration** for privacy
- 🌍 **Dynamic OverDrive library discovery** (NEW!)

## Setup Process

The script will create template configuration files on first run. Follow these steps:

### 1. Initial Configuration
Run any search command to generate the template files:
```bash
node library-search.js "test"
```

### 2. Set Up Your Preferences
Edit `preferences.json` to configure favorite libraries:
```json
{
  "favoriteLibraryIds": ["1234", "5678"]
}
```

### 3. Library Discovery

🆕 **Automatic Discovery (Recommended)**: The script now automatically discovers all OverDrive libraries worldwide! No manual setup required.

**Manual Configuration (Optional)**: Edit `libraries.json` if you want to use only specific libraries:
```json
[
  {
    "name": "Your Local Library",
    "id": "1234",
    "websiteId": "your-library-overdrive-id",
    "url": "https://your-library.overdrive.com",
    "accountRequired": false
  }
]
```

### 4. Available Command-Line Options

```
node library-search.js [format] "query" [options]

format: "book", "audiobook", or omit for both
query: Search terms in quotes

Options:
--export json     Export results as JSON file
--export csv      Export results as CSV file
--refresh-libs    Refresh the OverDrive libraries cache
--max-libs N      Limit search to first N libraries (for testing)
```

## Examples

```bash
# Basic search
node library-search.js "The Great Gatsby"

# Ebook only
node library-search.js "book" "1984"

# Audiobook only  
node library-search.js "audiobook" "Dune"

# Export to JSON
node library-search.js "Pride and Prejudice" --export json

# Refresh libraries and limit search
node library-search.js --refresh-libs --max-libs 50 "Atomic Habits"

# NEW: Library discovery commands
node library-search.js --stats                    # Show library statistics
node library-search.js --library-info "Seattle"   # Find library details
node library-search.js --library-info "Ohio"      # Search by partial name

# Combine commands
node library-search.js --stats --max-libs 10 "Book Title"  # Stats + limited search
```

## Understanding the Output

The script will show:
- 🟢 **Available**: Ready to borrow immediately
- 🟡 **On Hold**: Shows position in waitlist and estimated wait time
- 🔴 **Not Available**: Not in this library's collection
- 🔵 **Links**: Direct URLs to library catalog pages

## Files Created

- `preferences.json`: Your favorite library settings
- `libraries.json`: Library information (auto-populated or manual)
- `overdrive_libraries_cache.json`: Cached OverDrive library data
- `results/`: Export folder for JSON/CSV files

## Privacy & Security

- No account credentials stored
- Template files exclude sensitive information from git
- Rate limiting protects against API abuse
- All searches are anonymous unless you choose to log in to specific libraries

## Troubleshooting

**"No results found"**: Try different search terms or check if the book exists in digital format

**Rate limiting errors**: The script includes built-in delays, but if you see errors, wait a few minutes

**Library not showing results**: Some libraries require accounts - check the library's OverDrive site directly

**Template files not created**: Make sure you have write permissions in the script directory

## Technical Details

Built with Node.js and uses:
- OverDrive's public search APIs
- Rate limiting for responsible API usage  
- Colorized terminal output with chalk
- Robust error handling and retries

---

*Happy reading! 📚*
