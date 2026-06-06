// utils/requestQueue.js
class RegistrationQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue(request) {
    this.queue.push(request);
    console.log(`Request added to queue. Position: ${this.queue.length}`);
    this.processQueue();
  }

  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();

      try {
        const result = await this.processRequest(request);
        console.log("Success:", result);
      } catch (error) {
        console.error(`Failed processing ${request.email}:`, error.message);
      }

      await this.delay(1000);
    }

    this.processing = false;
  }

  async processRequest(request) {
    console.log(`Processing registration for: ${request.email}`);

    const result = await request.callback();

    console.log(`Completed registration for: ${request.email}`);

    return result;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new RegistrationQueue();
