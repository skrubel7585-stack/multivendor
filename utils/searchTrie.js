// utils/searchTrie.js
class TrieNode {
    constructor() {
        this.children = new Map();
        this.isEndOfWord = false;
        this.data = [];
    }
}

class SearchTrie {
    constructor() {
        this.root = new TrieNode();
    }

    insert(word, data) {
        let current = this.root;
        for (let char of word.toLowerCase()) {
            if (!current.children.has(char)) {
                current.children.set(char, new TrieNode());
            }
            current = current.children.get(char);
            current.data.push(data);
        }
        current.isEndOfWord = true;
    }

    search(prefix) {
        let current = this.root;
        for (let char of prefix.toLowerCase()) {
            if (!current.children.has(char)) {
                return [];
            }
            current = current.children.get(char);
        }
        return current.data;
    }

    getSuggestions(prefix) {
        const results = this.search(prefix);
        // Return unique results (using Set)
        return [...new Map(results.map(item => [item.id, item])).values()];
    }
}

module.exports = SearchTrie;