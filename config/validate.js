const { validateRuntimeConfig } = require('./runtime');

try {
  validateRuntimeConfig();
  console.log('Runtime configuration is valid.');
} catch (error) {
  console.error(error.name ? `${error.name}:` : 'ConfigurationError:');
  console.error(error.message);
  process.exit(1);
}

