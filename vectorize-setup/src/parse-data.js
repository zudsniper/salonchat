// Parse salon service data
const fs = require('fs');
const path = require('path');

// Parse the uploaded text file with salon services
function parseSalonServices(text) {
  const services = [];
  let currentService = null;
  
  // Split into lines
  const lines = text.split('\n').map(line => line.trim());
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if this is a service header (contains a pipe with price)
    if (line.includes('|')) {
      // Save the previous service if it exists
      if (currentService) {
        services.push(currentService);
      }
      
      // Parse the new service header
      const [name, price] = line.split('|').map(part => part.trim());
      
      currentService = {
        name,
        price: price || 'Price not specified',
        category: 'Hair Styling', // Default category
        description: ''
      };
    } 
    // If not a header, this is part of the description
    else if (currentService) {
      if (currentService.description) {
        currentService.description += ' ' + line;
      } else {
        currentService.description = line;
      }
    }
  }
  
  // Add the last service if it exists
  if (currentService) {
    services.push(currentService);
  }
  
  return services;
}

// Run this script directly
if (require.main === module) {
  try {
    // Read the sample data
    const samplePath = path.join(__dirname, '..', 'sample-data.txt');
    const data = fs.readFileSync(samplePath, 'utf8');
    
    // Parse the services
    const services = parseSalonServices(data);
    
    // Output as JSON
    console.log(JSON.stringify(services, null, 2));
    console.log(`Parsed ${services.length} services`);
  } catch (error) {
    console.error('Error parsing salon services:', error);
  }
}

module.exports = { parseSalonServices };
