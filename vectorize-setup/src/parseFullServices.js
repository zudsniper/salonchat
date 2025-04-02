// Parse the full services data from resources/services-prompt.txt
const fs = require('fs');
const path = require('path');

/**
 * Parse salon services data from the full prompt text
 * @param {string} text - The full services text content
 * @returns {Array<Object>} - Array of parsed service objects
 */
function parseServices(text) {
  // Services array to collect all parsed services
  const services = [];
  
  // First, split by main categories
  // Find the service categories by looking for lines that are all caps or end with a colon
  const lines = text.split('\n');
  let currentCategory = 'Uncategorized';
  let serviceStartIndex = -1;
  
  // Skip the first few lines which are instructions to the AI
  let contentStartIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Here is a list and description including prices')) {
      contentStartIndex = i + 1;
      break;
    }
  }
  
  // Process line by line
  for (let i = contentStartIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if this is a category header
    // Categories are short lines without prices that aren't part of a service description
    if (line.length < 40 && !line.includes('|') && !line.includes('$') && 
        (line === line.toUpperCase() || line.endsWith(':'))) {
      currentCategory = line.replace(':', '').trim();
      continue;
    }
    
    // Check if this line contains service name and price (contains | or $)
    if (line.includes('|') || (line.includes('$') && line.length < 80)) {
      // Save previous service if we were processing one
      if (serviceStartIndex !== -1) {
        const serviceText = lines.slice(serviceStartIndex, i).join(' ');
        const parsedService = parseServiceText(serviceText, currentCategory);
        if (parsedService) {
          services.push(parsedService);
        }
      }
      
      // Start a new service
      serviceStartIndex = i;
    }
  }
  
  // Add the last service if we were processing one
  if (serviceStartIndex !== -1 && serviceStartIndex < lines.length) {
    const serviceText = lines.slice(serviceStartIndex).join(' ');
    const parsedService = parseServiceText(serviceText, currentCategory);
    if (parsedService) {
      services.push(parsedService);
    }
  }
  
  return services;
}

/**
 * Parse a single service text block
 * @param {string} text - The service text
 * @param {string} category - The service category
 * @returns {Object|null} - Parsed service object or null if invalid
 */
function parseServiceText(text, category) {
  // Extract name and price
  let name = '';
  let price = '';
  let description = '';
  
  // Handle standard format "Name | Price"
  if (text.includes('|')) {
    [name, price] = text.split('|', 2).map(s => s.trim());
    description = text.split('|').slice(1).join('|');
    
    // If description starts with the price, remove it
    if (description.startsWith(price)) {
      description = description.substring(price.length).trim();
    }
  } 
  // Handle alternative format "Name From $X"
  else if (text.includes('$')) {
    const nameEnd = text.indexOf('$');
    const priceEnd = text.indexOf(' ', nameEnd + 1);
    
    name = text.substring(0, nameEnd).trim();
    
    // Extract price depending on format
    if (priceEnd !== -1) {
      price = text.substring(nameEnd - 5, priceEnd).trim();
      description = text.substring(priceEnd).trim();
    } else {
      price = text.substring(nameEnd - 5).trim();
      description = '';
    }
  }
  
  // Cleanup the price
  if (!price.includes('$') && text.includes('$')) {
    const priceMatch = text.match(/\$\d+/);
    if (priceMatch) {
      price = priceMatch[0];
    }
  }
  
  // Clean up the description
  if (!description && text.includes('.')) {
    description = text.substring(text.indexOf('.') + 1).trim();
  }
  
  if (!name || name.length > 100) {
    // This doesn't look like a valid service name
    return null;
  }
  
  return {
    name,
    price: price || 'Price varies',
    category: category || 'Uncategorized',
    description: description || `${name} service at Apotheca Salon.`
  };
}

// Run this script directly
if (require.main === module) {
  try {
    // Read the full prompt file
    const promptPath = path.join(__dirname, '../../resources/services-prompt.txt');
    const data = fs.readFileSync(promptPath, 'utf8');
    
    // Parse the services
    const services = parseServices(data);
    
    // Output as JSON
    console.log(JSON.stringify(services, null, 2));
    console.log(`Parsed ${services.length} services`);
  } catch (error) {
    console.error('Error parsing salon services:', error);
  }
}

module.exports = { parseServices };
