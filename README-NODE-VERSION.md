# Node.js Version Requirements

This project requires Node.js version 22.14.0.

## Using NVM (Node Version Manager)

1. Install Node.js 22.14.0:
   ```bash
   nvm install 22.14.0
   ```

2. Use Node.js 22.14.0:
   ```bash
   nvm use 22.14.0
   ```

3. Verify installation:
   ```bash
   node -v
   ```

## Using Helper Scripts

We've added scripts to simplify version management:

1. Overall node setup:
   ```bash
   ./use-correct-node.sh
   ```

2. For vectorize setup:
   ```bash
   cd vectorize-setup
   ./setup-with-nvm.sh
   ```

## Troubleshooting

If you see error messages about unsupported engine, ensure you're using Node.js 22.14.0.
