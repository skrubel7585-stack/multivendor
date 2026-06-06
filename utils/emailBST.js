// utils/emailBST.js
class EmailNode {
    constructor(email, userId) {
        this.email = email;
        this.userId = userId;
        this.left = null;
        this.right = null;
    }
}

class EmailBST {
    constructor() {
        this.root = null;
    }

    insert(email, userId) {
        const newNode = new EmailNode(email, userId);
        if (!this.root) {
            this.root = newNode;
            return;
        }

        let current = this.root;
        while (true) {
            if (email < current.email) {
                if (!current.left) {
                    current.left = newNode;
                    break;
                }
                current = current.left;
            } else if (email > current.email) {
                if (!current.right) {
                    current.right = newNode;
                    break;
                }
                current = current.right;
            } else {
                break; // Duplicate email
            }
        }
    }

    search(email) {
        let current = this.root;
        while (current) {
            if (email === current.email) {
                return current.userId;
            } else if (email < current.email) {
                current = current.left;
            } else {
                current = current.right;
            }
        }
        return null;
    }

    // In-order traversal for sorted emails
    getSortedEmails() {
        const result = [];
        this.inOrderTraversal(this.root, result);
        return result;
    }

    inOrderTraversal(node, result) {
        if (node) {
            this.inOrderTraversal(node.left, result);
            result.push({ email: node.email, userId: node.userId });
            this.inOrderTraversal(node.right, result);
        }
    }
}

module.exports = EmailBST;