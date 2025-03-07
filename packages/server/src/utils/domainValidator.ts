import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Configuration for domain validation
 */
interface DomainValidatorConfig {
  allowedDomains: string[];
  allowLocalhost: boolean;
}

/**
 * Loads allowed domains from a JSON file
 * @returns Array of allowed domains
 */
export const loadAllowedDomainsFromFile = (): string[] => {
  try {
    const filePath = path.join(__dirname, '../../valid_clients.json');
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsedContent = JSON.parse(fileContent);
      return Array.isArray(parsedContent.domains) ? parsedContent.domains : [];
    }
  } catch (error) {
    console.error('Error loading valid_clients.json:', error);
  }
  return [];
};

/**
 * Load allowed domains from environment variables and optionally from a JSON file
 * Expected format: comma-separated list of domains in ALLOWED_DOMAINS env var
 * Example: "example.com,subdomain.example.org,another-domain.com"
 */
export const loadAllowedDomains = (): DomainValidatorConfig => {
  const allowedDomainsStr = process.env.ALLOWED_DOMAINS || '';
  const allowLocalhost = process.env.ALLOW_LOCALHOST === 'true';
  
  // Parse comma-separated domains from environment variable
  const domainsFromEnv = allowedDomainsStr
    .split(',')
    .map(domain => domain.trim())
    .filter(domain => domain.length > 0);
  
  // Get domains from file
  const domainsFromFile = loadAllowedDomainsFromFile();
  
  // Combine and deduplicate domains
  const allowedDomains = [...new Set([...domainsFromEnv, ...domainsFromFile])];
  
  return {
    allowedDomains,
    allowLocalhost
  };
};

/**
 * Check if a domain is in the allowed domains list
 * @param domain Domain to check
 * @param config Domain validator configuration
 * @returns True if domain is allowed, false otherwise
 */
export const isDomainAllowed = (
  domain: string, 
  config: DomainValidatorConfig = loadAllowedDomains()
): boolean => {
  if (!domain) return false;
  
  // Extract domain without protocol and path
  const cleanDomain = extractDomain(domain);
  
  // Allow localhost in development if configured
  if (config.allowLocalhost && 
     (cleanDomain === 'localhost' || 
      cleanDomain.startsWith('localhost:') || 
      cleanDomain.match(/^127\.0\.0\.1(:\d+)?$/))
  ) {
    return true;
  }
  
  // Check if the domain is in the allowed list
  return config.allowedDomains.some(allowedDomain => {
    // Exact match
    if (cleanDomain === allowedDomain) return true;
    
    // Wildcard subdomain match (*.example.com)
    if (allowedDomain.startsWith('*.')) {
      const baseDomain = allowedDomain.substring(2);
      return cleanDomain.endsWith(baseDomain) && 
             cleanDomain.length > baseDomain.length &&
             cleanDomain.charAt(cleanDomain.length - baseDomain.length - 1) === '.';
    }
    
    return false;
  });
};

/**
 * Extract clean domain from a URL or domain string
 * @param domain Domain or URL to clean
 * @returns Clean domain without protocol or paths
 */
export const extractDomain = (domain: string): string => {
  try {
    // Handle URLs with protocol
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      const url = new URL(domain);
      return url.host;
    }
    
    // Handle domain:port format
    if (domain.includes(':')) {
      const parts = domain.split(':');
      if (parts.length === 2 && !isNaN(Number(parts[1]))) {
        return domain; // Return as is if it's a valid domain:port
      }
    }
    
    // Return domain as is if it doesn't have protocol
    return domain.split('/')[0];
  } catch (error) {
    // If URL parsing fails, return the original string
    return domain;
  }
};

/**
 * Validate if a request is coming from an allowed domain
 * Checks Origin and Referer headers
 * @param req Express request object
 * @returns True if request is from allowed domain, false otherwise
 */
export const validateRequestDomain = (req: Request): boolean => {
  const config = loadAllowedDomains();
  
  // Check Origin header first (preferred)
  const origin = req.headers.origin as string | undefined;
  if (origin && isDomainAllowed(origin, config)) {
    return true;
  }
  
  // Fall back to Referer header
  const referer = req.headers.referer as string | undefined;
  if (referer && isDomainAllowed(referer, config)) {
    return true;
  }
  
  return false;
};

/**
 * Create middleware to validate request domain
 * @param options Configuration options
 * @returns Express middleware function
 */
export const domainValidationMiddleware = (
  options: { redirectUrl?: string } = {}
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (validateRequestDomain(req)) {
      // Set CORS headers for allowed origins
      const origin = req.headers.origin || req.headers.referer as string;
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
      next();
    } else {
      console.warn(`Request from unauthorized domain: ${req.headers.origin || req.headers.referer || 'unknown'}`);
      if (options.redirectUrl) {
        res.redirect(options.redirectUrl);
      } else {
        res.status(403).json({
          error: 'Domain not allowed',
          message: 'This domain is not authorized to access this resource'
        });
      }
    }
  };
};

/**
 * CORS configuration for express
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || isDomainAllowed(origin, loadAllowedDomains())) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

/**
 * Legacy middleware for backward compatibility
 */
export const validateDomain = domainValidationMiddleware();

