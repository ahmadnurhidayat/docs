import type { CollectionEntry } from 'astro:content';

export interface NavNode {
    name: string;
    slug: string;
    type: 'directory' | 'file';
    depth: number;
    children?: NavNode[];
    title?: string;
}

function inferTitleFromBody(body: string): string | undefined {
    const match = body.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : undefined;
}

function getDisplayName(filename: string): string {
    return filename.replace(/\.md$/, '');
}

function sortTree(nodes: NavNode[]): void {
    nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
        if (node.children) {
            sortTree(node.children);
        }
    }
}

function insertNode(
    root: NavNode[],
    parts: string[],
    entry: CollectionEntry<'docs'>,
    depth: number
): void {
    const [first, ...rest] = parts;

    if (rest.length === 0) {
        // This is a file
        const title = entry.data.title ?? inferTitleFromBody(entry.body ?? '');
        root.push({
            name: getDisplayName(first),
            slug: entry.slug,
            type: 'file',
            depth,
            title,
        });
        return;
    }

    // This is a directory
    let dir = root.find(n => n.type === 'directory' && n.name === first);
    if (!dir) {
        dir = {
            name: first,
            slug: parts.slice(0, parts.length - rest.length).join('/'),
            type: 'directory',
            depth,
            children: [],
        };
        root.push(dir);
    }

    insertNode(dir.children!, rest, entry, depth + 1);
}

export function buildNavTree(entries: CollectionEntry<'docs'>[]): NavNode[] {
    const root: NavNode[] = [];

    for (const entry of entries) {
        const parts = entry.slug.split('/');
        insertNode(root, parts, entry, 0);
    }

    sortTree(root);
    return root;
}

export function flattenTree(tree: NavNode[]): NavNode[] {
    const flat: NavNode[] = [];

    function walk(nodes: NavNode[]) {
        for (const n of nodes) {
            if (n.type === 'file') flat.push(n);
            if (n.children) walk(n.children);
        }
    }

    walk(tree);
    return flat;
}

export function findPrevNext(
    flatList: NavNode[],
    currentSlug: string
): { prev: NavNode | null; next: NavNode | null } {
    const index = flatList.findIndex(n => n.slug === currentSlug);
    return {
        prev: index > 0 ? flatList[index - 1] : null,
        next: index < flatList.length - 1 ? flatList[index + 1] : null,
    };
}
