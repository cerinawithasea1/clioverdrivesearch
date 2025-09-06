const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { RateLimiterMemory } = require('rate-limiter-flexible');
const chalk = require('chalk');

// Cache file for dynamic library list
const LIB_CACHE = path.join(__dirname, 'libraries.api.cache.json');

// Create a rate limiter - 1 request per 2 seconds to be safe
const rateLimiter = new RateLimiterMemory({
    points: 1,
    duration: 2
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
        try {
            await rateLimiter.consume(1);
        } catch (rateLimitError) {
            // Wait for rate limit to reset
            await new Promise(resolve => setTimeout(resolve, rateLimitError.msBeforeNext));
            continue;
        }
        
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
            
            // Check if there's a next page (limit to 10 pages to get more libraries)
            if (data.links && data.links.next && currentPage < 10) {
                currentPage = data.links.next.page;
            } else {
                break; // No more pages or reached test limit
            }
            
        } catch (error) {
            console.error(chalk.red(`Error fetching libraries page ${currentPage}: ${error.message || error}`));
            console.error('Full error:', error);
            break; // Stop fetching on error
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
    
    // Try the new detailed libraries data first
    if (fs.existsSync('./libraries_detailed.json')) {
        try {
            const detailedData = JSON.parse(fs.readFileSync('./libraries_detailed.json', 'utf8'));
            return detailedData
                .map(item => {
                    // Each item is an object with library slug as key
                    const slug = Object.keys(item)[0];
                    const info = item[slug];
                    return {
                        slug: slug,
                        name: info.name,
                        status: info.status,
                        isConsortium: info.isConsortium
                    };
                })
                .filter(lib => lib.status === 'Live')
                .map(lib => lib.slug);
        } catch (e) {
            console.warn(chalk.yellow('Failed to load detailed libraries, falling back to simple list'));
        }
    }
    
    // Try the simple libraries data
    if (fs.existsSync('./libraries_simple.json')) {
        try {
            const simpleData = JSON.parse(fs.readFileSync('./libraries_simple.json', 'utf8'));
            return simpleData
                .filter(lib => lib.status === 'Live')
                .map(lib => lib.slug);
        } catch (e) {
            console.warn(chalk.yellow('Failed to load simple libraries data'));
        }
    }
    
    // Fallback to static libraries.json (existing behavior)
    try {
        const librariesData = JSON.parse(fs.readFileSync('./libraries.json', 'utf8'));
        return Object.values(librariesData).map(url => url.replace('.overdrive.com', ''));
    } catch {
        return [];
    }
}

function loadDetailedLibraries() {
    if (fs.existsSync('./libraries_detailed.json')) {
        try {
            const detailedData = JSON.parse(fs.readFileSync('./libraries_detailed.json', 'utf8'));
            const libraryMap = new Map();
            
            detailedData.forEach(item => {
                const slug = Object.keys(item)[0];
                const info = item[slug];
                libraryMap.set(slug, {
                    slug: slug,
                    name: info.name,
                    status: info.status,
                    isConsortium: info.isConsortium,
                    websiteId: info.websiteId,
                    links: info.links || {},
                    features: {
                        instantAccess: info.isInstantAccessEnabled,
                        luckyDay: info.isLuckyDayEnabled,
                        deepSearch: info.allowDeepSearch,
                        anonymousSampling: info.allowAnonymousSampling
                    }
                });
            });
            
            return libraryMap;
        } catch (e) {
            console.warn(chalk.yellow('Failed to load detailed library info:', e.message));
        }
    }
    
    // Fallback to simple data
    if (fs.existsSync('./libraries_simple.json')) {
        try {
            const simpleData = JSON.parse(fs.readFileSync('./libraries_simple.json', 'utf8'));
            const libraryMap = new Map();
            
            simpleData.forEach(lib => {
                libraryMap.set(lib.slug, {
                    slug: lib.slug,
                    name: lib.name,
                    status: lib.status,
                    isConsortium: lib.isConsortium,
                    features: {}
                });
            });
            
            return libraryMap;
        } catch (e) {
            console.warn(chalk.yellow('Failed to load simple library info:', e.message));
        }
    }
    
    return new Map();
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

function showLibraryStats() {
    console.log(chalk.cyan('📊 Library Statistics'));
    console.log(chalk.cyan('='.repeat(50)));
    
    const detailedLibs = loadDetailedLibraries();
    if (detailedLibs.size === 0) {
        console.log(chalk.red('No library data found'));
        return;
    }
    
    let consortiums = 0;
    let individual = 0;
    let instantAccess = 0;
    let luckyDay = 0;
    let deepSearch = 0;
    
    detailedLibs.forEach(lib => {
        if (lib.isConsortium) consortiums++; else individual++;
        if (lib.features.instantAccess) instantAccess++;
        if (lib.features.luckyDay) luckyDay++;
        if (lib.features.deepSearch) deepSearch++;
    });
    
    console.log(chalk.green(`📚 Total Libraries: ${detailedLibs.size}`));
    console.log(chalk.blue(`🏛️  Consortiums: ${consortiums}`));
    console.log(chalk.blue(`🏗️  Individual Libraries: ${individual}`));
    console.log(chalk.yellow(`⚡ Instant Access Enabled: ${instantAccess}`));
    console.log(chalk.yellow(`🍀 Lucky Day Enabled: ${luckyDay}`));
    console.log(chalk.yellow(`🔍 Deep Search Enabled: ${deepSearch}`));
    console.log();
}

function findLibraryInfo(searchTerm) {
    console.log(chalk.cyan(`🔍 Searching for libraries matching: "${searchTerm}"`));
    console.log(chalk.cyan('='.repeat(50)));
    
    const detailedLibs = loadDetailedLibraries();
    if (detailedLibs.size === 0) {
        console.log(chalk.red('No library data found'));
        return;
    }
    
    const matches = [];
    const searchLower = searchTerm.toLowerCase();
    
    detailedLibs.forEach(lib => {
        if (lib.name.toLowerCase().includes(searchLower) || 
            lib.slug.toLowerCase().includes(searchLower)) {
            matches.push(lib);
        }
    });
    
    if (matches.length === 0) {
        console.log(chalk.red('No matching libraries found'));
        return;
    }
    
    matches.forEach(lib => {
        console.log(chalk.green(`📚 ${lib.name}`));
        console.log(chalk.gray(`   Slug: ${lib.slug}`));
        console.log(chalk.gray(`   Type: ${lib.isConsortium ? 'Consortium' : 'Individual Library'}`));
        
        if (lib.features.instantAccess) console.log(chalk.yellow('   ⚡ Instant Access'));
        if (lib.features.luckyDay) console.log(chalk.yellow('   🍀 Lucky Day'));
        if (lib.features.deepSearch) console.log(chalk.yellow('   🔍 Deep Search'));
        
        if (lib.links.libraryHome) {
            console.log(chalk.blue(`   🌐 Website: ${lib.links.libraryHome.href}`));
        }
        if (lib.links.cardAcquisitionUrl) {
            console.log(chalk.blue(`   📇 Get Card: ${lib.links.cardAcquisitionUrl.href}`));
        }
        console.log();
    });
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
            } else if (error.msBeforeNext) {
                // Rate limiter error - wait and continue to next library
                console.log(chalk.yellow(`Rate limited on ${library}, waiting ${Math.ceil(error.msBeforeNext/1000)}s...`));
                await new Promise(resolve => setTimeout(resolve, error.msBeforeNext));
                continue; // Continue to next library instead of retrying all
            }
            console.error(chalk.red(`Error searching ${library}: ${error.message || 'Network error'}`));
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
        let showStats = false;
        let libraryInfo = null;
        
        args.forEach((arg, index) => {
            if (arg === '--export') {
                format = args[index + 1];
            } else if (arg === '--refresh-libs') {
                refreshLibs = true;
            } else if (arg === '--max-libs') {
                maxLibs = parseInt(args[index + 1] || '0', 10) || null;
            } else if (arg === '--stats') {
                showStats = true;
            } else if (arg === '--library-info') {
                libraryInfo = args[index + 1];
            } else if (!['json', 'csv', '--refresh-libs', '--max-libs', '--stats', '--library-info'].includes(arg) && !arg.match(/^\d+$/)) {
                searchTerms.push(arg);
            }
        });
        
        const searchTerm = searchTerms.join(" ");
        
        // Handle new commands first
        if (showStats) {
            showLibraryStats();
            if (!searchTerm) process.exit(0);
        }
        
        if (libraryInfo) {
            findLibraryInfo(libraryInfo);
            if (!searchTerm) process.exit(0);
        }
        
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
                console.error(chalk.red('❌ Error refreshing libraries:'), error.message || error);
                console.error('Full error details:', error);
                process.exit(1);
            }
        }
    
    if (!searchTerm && !showStats && !libraryInfo) {
        if (refreshLibs) return; // Already handled above
        console.error("Please provide a search term or use a command");
        console.log("\nUsage:");
        console.log("  libsearch \"Book Title\"                    # Search all libraries");
        console.log("  libsearch --refresh-libs                 # Refresh library cache");
        console.log("  libsearch --max-libs 50 \"Book Title\"    # Limit to first 50 libraries");
        console.log("  libsearch \"Book Title\" --export json     # Export results");
        console.log("\nNew Commands:");
        console.log("  libsearch --stats                        # Show library statistics");
        console.log("  libsearch --library-info \"Seattle\"       # Find library info by name/slug");
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
