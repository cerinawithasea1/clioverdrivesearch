const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { RateLimiterMemory } = require('rate-limiter-flexible');
const chalk = require('chalk');

// Create a rate limiter - 2 requests per second
const rateLimiter = new RateLimiterMemory({
    points: 2,
    duration: 1
});

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

async function searchLibraries(searchTitle, searchAuthor = "") {
    const preferences = loadPreferences();
    const librariesData = JSON.parse(fs.readFileSync("./libraries.json", "utf8"));
    
    // Sort libraries to search favorites first
    const libraries = Object.entries(librariesData)
        .sort(([nameA], [nameB]) => {
            const aIsFavorite = preferences.favoriteLibraries.includes(nameA);
            const bIsFavorite = preferences.favoriteLibraries.includes(nameB);
            return bIsFavorite - aIsFavorite;
        })
        .map(([, url]) => url.replace(".overdrive.com", ""));
    
    const results = [];
    
    for (const library of libraries) {
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
    const [,, ...args] = process.argv;
    let format = null;
    let searchTerms = [];
    
    // Parse command line arguments
    args.forEach((arg, index) => {
        if (arg === '--export') {
            format = args[index + 1];
        } else if (arg !== 'json' && arg !== 'csv') {
            searchTerms.push(arg);
        }
    });
    
    const searchTerm = searchTerms.join(" ");
    
    if (!searchTerm) {
        console.error("Please provide a search term");
        process.exit(1);
    }
    
    searchLibraries(searchTerm)
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
}

module.exports = { searchLibraries, exportResults };
