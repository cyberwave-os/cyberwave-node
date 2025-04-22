// Function that returns a greeting message
function createGreeting(name: string = "World"): string {
  return `Hello, ${name}!`;
}

// Print the greeting
console.log(createGreeting());

// Example with a custom name
console.log(createGreeting("TypeScript"));