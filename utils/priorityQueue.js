// utils/priorityQueue.js
class PriorityQueue {
    constructor() {
        this.heap = [];
    }

    enqueue(priority, data) {
        const element = { priority, data, timestamp: Date.now() };
        this.heap.push(element);
        this.bubbleUp(this.heap.length - 1);
    }

    bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
            
            [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
            index = parentIndex;
        }
    }

    dequeue() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();
        
        const min = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.sinkDown(0);
        return min;
    }

    sinkDown(index) {
        const length = this.heap.length;
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let swap = null;
            let element = this.heap[index];

            if (leftChildIndex < length && this.heap[leftChildIndex].priority < element.priority) {
                swap = leftChildIndex;
            }

            if (rightChildIndex < length) {
                if ((swap === null && this.heap[rightChildIndex].priority < element.priority) ||
                    (swap !== null && this.heap[rightChildIndex].priority < this.heap[leftChildIndex].priority)) {
                    swap = rightChildIndex;
                }
            }

            if (swap === null) break;
            [this.heap[index], this.heap[swap]] = [this.heap[swap], this.heap[index]];
            index = swap;
        }
    }

    size() {
        return this.heap.length;
    }
}

module.exports = PriorityQueue;