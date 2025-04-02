// Read salon services data from resources/services.json
const fs = require('fs');
const path = require('path');

/**
 * Load salon services data from the JSON file
 * @returns {Array<Object>} - Array of service objects
 */
function parseServices() {
  // Get the path to the services JSON file
  const servicesPath = path.join(__dirname, '../../resources/services.json');
  
  // Read and parse the JSON file
  const data = fs.readFileSync(servicesPath, 'utf8');
  const services = JSON.parse(data);
  
  return services;
}

// Run this script directly
if (require.main === module) {
  try {
    // Parse the services
    const services = parseServices();
    
    // Output as JSON
    console.log(JSON.stringify(services, null, 2));
    console.log(`Loaded ${services.length} services`);
  } catch (error) {
    console.error('Error loading salon services:', error);
  }
}

module.exports = { parseServices };
