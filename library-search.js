const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { RateLimiterMemory } = require('rate-limiter-flexible');
const chalk = require('chalk');

// Cache file for dynamic library list
const LIB_CACHE = path.join(__dirname, 'libraries.api.cache.json');

// Create a rate limiter - 2 requests per second
const rateLimiter = new RateLimiterMemory({
    points: 2,
    duration: 1
});

async function fetchAllLibrariesFromAPI({ refresh = false } = {}) {
    if (!refresh && fs.existsSync(LIB_CACHE)) {
        try {
            const cached = JSON.parse(fs.readFileSync(LIB_CACHE, 'utf8'));
            console.log(chalk.green(`Using cached library list (${cached.length} libraries)`));
            return cached;
        } catch {}
    }

    console.log(chalk.cyan('Fetching OverDrive libraries from API...'));
    const allItems = [];
    let page = 1;
    const perPage = 200;

    let currentPage = 1;
    const baseUrl = `https://thunder.api.overdrive.com/v2/libraries`;
    
    while (true) {
        await rateLimiter.consume(1);
        const url = currentPage === 1 ? baseUrl : `${baseUrl}?page=${currentPage}`;
        
        try {
            const res = await fetch(url, { 
                headers: { 'User-Agent': 'library-finder/1.0' } 
            });
            
            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
                console.log(chalk.yellow(`Rate limited, waiting ${retryAfter} seconds...`));
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                continue;
            }
            
            if (!res.ok) {
                throw new Error(`Library index fetch failed: ${res.status} ${res.statusText}`);
            }
            
            const data = await res.json();
            const items = Array.isArray(data.items) ? data.items : [];
            
            if (items.length === 0) break;
            
            allItems.push(...items);
            console.log(chalk.gray(`Fetched page ${currentPage}: ${items.length} libraries (${allItems.length} total)`));
            
            // Check if there's a next page (limit to 3 pages for testing)
            if (data.links && data.links.next && currentPage < 3) {
                currentPage = data.links.next.page;
            } else {
                break; // No more pages or reached test limit
            }
            
        } catch (error) {
            console.error(chalk.red(`Error fetching libraries: ${error.message}`));
            console.error('Full error:', error);
            break;
        }
    }

    // Normalize to slugs your search uses
    const normalized = allItems
        .map(item => ({
            slug: (item.preferredKey || item.id || '').trim(),
            name: item.name || 'Unknown Library',
            isConsortium: !!item.isConsortium,
            status: item.status
        }))
        .filter(item => item.slug && item.status === 'Live');

    fs.writeFileSync(LIB_CACHE, JSON.stringify(normalized, null, 2));
    console.log(chalk.green(`✅ Cached ${normalized.length} active libraries`));
    return normalized;
}

function loadLibrarySlugs({ dynamic = true } = {}) {
    // Try dynamic cache first if requested
    if (dynamic && fs.existsSync(LIB_CACHE)) {
        try {
            const list = JSON.parse(fs.readFileSync(LIB_CACHE, 'utf8'));
            return list.map(l => l.slug);
        } catch {}
    }
    
    // Fallback to static libraries.json (existing behavior)
    try {
        const librariesData = JSON.parse(fs.readFileSync('./libraries.json', 'utf8'));
        return Object.values(librariesData).map(url => url.replace('.overdrive.com', ''));
    } catch {
        return [];
    }
}

function loadPreferences() {
    try {
        return JSON.parse(fs.readFileSync("./preferences.json", "utf8"));
    } catch {
        return {
            favoriteLibraries: [],
            searchPreferences: {},
            exportDefaults: { format: "json", directory: "./search-results", includeTimestamp: true }
        };
    }
}

function exportResults(results, format = "json") {
    const prefs = loadPreferences();
    const timestamp = prefs.exportDefaults.includeTimestamp ? 
        `-${new Date().toISOString().replace(/[:.]/g, '-')}` : 
        '';
    const directory = prefs.exportDefaults.directory || './search-results';
    
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }

    const filename = path.join(directory, `library-search${timestamp}.${format}`);

    if (format === 'json') {
        fs.writeFileSync(filename, JSON.stringify(results, null, 2));
    } else if (format === 'csv') {
        const csvRows = [['Title', 'Author', 'Format', 'Library', 'Available', 'Copies', 'Holds', 'Wait Days', 'URL']];
        Object.values(results).forEach(copies => {
            copies.forEach(result => {
                csvRows.push([
                    result.title,
                    result.author,
                    result.format,
                    result.library,
                    result.available ? 'Yes' : 'No',
                    `${result.availableCopies}/${result.totalCopies}`,
                    result.holds,
                    result.estimatedWaitDays,
                    result.url
                ].map(val => `"${val}"`));
            });
        });
        fs.writeFileSync(filename, csvRows.map(row => row.join(',')).join('\n'));
    }
    return filename;
}

async function searchLibraries(searchTitle, searchAuthor = "", { maxLibs = null, dynamic = true } = {}) {
    const preferences = loadPreferences();
    
    // Load libraries dynamically from OverDrive API or fallback to static list
    let slugs = loadLibrarySlugs({ dynamic });
    if (slugs.length === 0 && dynamic) {
        // First run or no cache: fetch and cache dynamically
        const libs = await fetchAllLibrariesFromAPI({ refresh: false });
        slugs = libs.map(l => l.slug);
    }
    
    if (slugs.length === 0) {
        throw new Error('No libraries found. Try running with --refresh-libs or create libraries.json');
    }
    
    console.log(chalk.cyan(`📚 Searching ${slugs.length} libraries...`));
    
    // Sort favorites first (support both names and slugs)
    const favoriteSet = new Set(preferences.favoriteLibraries || []);
    const libraries = slugs.sort((a, b) => {
        const aFav = favoriteSet.has(a);
        const bFav = favoriteSet.has(b);
        return (bFav ? 1 : 0) - (aFav ? 1 : 0);
    });
    
    // Limit libraries if requested
    const searchLibraries = maxLibs ? libraries.slice(0, maxLibs) : libraries;
    
    if (maxLibs) {
        console.log(chalk.gray(`➡️  Limited to first ${searchLibraries.length} libraries`));
    }
    
    const results = [];
    
    for (const library of searchLibraries) {
        try {
            // Wait if we've hit the rate limit
            await rateLimiter.consume(1);

            const apiUrl = `https://thunder.api.overdrive.com/v2/libraries/${library}/media?` + 
                `title=${encodeURIComponent(searchTitle)}` +
                (searchAuthor ? `&creator=${encodeURIComponent(searchAuthor)}` : "") +
                `&format=ebook-overdrive,ebook-media-do,ebook-overdrive-provisional,audiobook-overdrive,audiobook-overdrive-provisional` +
                `&perPage=24&page=1&x-client-id=dewey`;
            
            const response = await fetch(apiUrl);
            
            // Handle rate limit responses from the API
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('retry-after') || '5');
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                throw new Error('Rate limited by API - retrying');
            }
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                for (const book of data.items) {
                    results.push({
                        library,
                        title: book.title,
                        author: book.firstCreatorName,
                        format: book.type.id,
                        available: book.isAvailable,
                        availableCopies: book.availableCopies || 0,
                        totalCopies: book.ownedCopies || 0,
                        holds: book.holdsCount || 0,
                        estimatedWaitDays: book.estimatedWaitDays || 0,
                        url: `https://${library}.overdrive.com/media/${book.id}`
                    });
                }
            }
        } catch (error) {
            if (error.message === 'Rate limited by API - retrying') {
                // Retry this library
                console.log(chalk.yellow(`Rate limited on ${library}, retrying...`));
                return searchLibraries(searchTitle, searchAuthor);
            } else if (error.name === 'RateLimiterRes') {
                // Wait the required time then retry
                await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
                return searchLibraries(searchTitle, searchAuthor);
            }
            console.error(chalk.red(`Error searching ${library}: ${error.message}`));
        }
    }
    
    // Sort results: Available first, then by wait time
    results.sort((a, b) => {
        if (a.available !== b.available) return b.available - a.available;
        if (!a.available && !b.available) return a.estimatedWaitDays - b.estimatedWaitDays;
        return 0;
    });

    // Group by title to show all libraries that have the book
    const groupedResults = results.reduce((acc, curr) => {
        const key = `${curr.title}-${curr.format}`;
        if (!acc[key]) acc[key] = [];
        acc[key].push(curr);
        return acc;
    }, {});

    return groupedResults;
}

if (require.main === module) {
    (async () => {
        const [,, ...args] = process.argv;
        let format = null;
        let refreshLibs = false;
        let maxLibs = null;
        let searchTerms = [];
        
        // Parse command line arguments
        args.forEach((arg, index) => {
            if (arg === '--export') {
                format = args[index + 1];
            } else if (arg === '--refresh-libs') {
                refreshLibs = true;
            } else if (arg === '--max-libs') {
                maxLibs = parseInt(args[index + 1] || '0', 10) || null;
            } else if (!['json', 'csv', '--refresh-libs', '--max-libs'].includes(arg) && !arg.match(/^\d+$/)) {
                searchTerms.push(arg);
            }
        });
        
        const searchTerm = searchTerms.join(" ");
        
        // Handle refresh-libs flag
        if (refreshLibs) {
            console.log(chalk.cyan('🔄 Refreshing OverDrive libraries index...'));
            try {
                await fetchAllLibrariesFromAPI({ refresh: true });
                if (!searchTerm) {
                    console.log(chalk.green('✅ Library cache refreshed!'));
                    process.exit(0);
                }
            } catch (error) {
                console.error(chalk.red('❌ Error refreshing libraries:'), error.message);
                process.exit(1);
            }
        }
    
    if (!searchTerm) {
        if (refreshLibs) return; // Already handled above
        console.error("Please provide a search term");
        console.log("\nUsage:");
        console.log("  libsearch \"Book Title\"                 # Search all libraries");
        console.log("  libsearch --refresh-libs              # Refresh library cache");
        console.log("  libsearch --max-libs 50 \"Book Title\" # Limit to first 50 libraries");
        console.log("  libsearch \"Book Title\" --export json  # Export results");
        process.exit(1);
    }
    
    const searchOptions = {};
    if (maxLibs) searchOptions.maxLibs = maxLibs;
    
    searchLibraries(searchTerm, "", searchOptions)
        .then(groupedResults => {
            if (Object.keys(groupedResults).length === 0) {
                console.log(chalk.yellow("No results found"));
                return;
            }
            
            Object.values(groupedResults).forEach(copies => {
                const first = copies[0];
                console.log(chalk.gray("\n==================================="));
                console.log(chalk.bold(`Title: ${first.title}`));
                console.log(`Author: ${first.author}`);
                console.log(`Format: ${chalk.cyan(first.format)}`);
                console.log(chalk.bold("\nAvailable at:"));
                
                // Show available copies first
                const available = copies.filter(c => c.available);
                const unavailable = copies.filter(c => !c.available);
                
                available.forEach(result => {
                    console.log(`\n  ${chalk.bold(result.library)}:`);
                    console.log(chalk.green(`    Status: Available Now!`));
                    console.log(`    Copies: ${chalk.green(result.availableCopies)}/${result.totalCopies}`);
                    console.log(`    URL: ${chalk.blue.underline(result.url)}`);
                });
                
                if (unavailable.length > 0) {
                    console.log(chalk.bold("\n  Waitlist:"));
                    unavailable.forEach(result => {
                        console.log(`\n    ${chalk.bold(result.library)}:`);
                        console.log(chalk.yellow(`      Holds: ${result.holds}`));
                        if (result.estimatedWaitDays) {
                            console.log(chalk.yellow(`      Expected wait: ${result.estimatedWaitDays} days`));
                        }
                        console.log(`      URL: ${chalk.blue.underline(result.url)}`);
                    });
                }
            });
            
            // Export results if format is specified
            if (format) {
                const exportedFile = exportResults(groupedResults, format);
                console.log(chalk.cyan(`\nResults exported to: ${exportedFile}`));
            }
        })
        .catch(error => {
            console.error(chalk.red("Error:"), error);
            process.exit(1);
        });
    })().catch(error => {
        console.error(chalk.red("Fatal error:"), error.message);
        process.exit(1);
    });
}

module.exports = { 
    searchLibraries, 
    exportResults, 
    fetchAllLibrariesFromAPI, 
    loadLibrarySlugs 
};
