import { JSDOM } from 'jsdom';
import React from 'react';

const jsdom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost',
});

const { window } = jsdom;

global.window = window;
global.document = window.document;
global.React = React; // Added for JSX transform compatibility in Node

Object.defineProperty(global, 'navigator', {
    value: window.navigator,
    writable: true,
    configurable: true
});

// Mock localStorage and sessionStorage
const storageMock = () => {
    let storage = {};
    return {
        getItem: (key) => storage[key] || null,
        setItem: (key, value) => { storage[key] = String(value); },
        removeItem: (key) => { delete storage[key]; },
        clear: () => { storage = {}; },
        length: 0,
        key: (i) => Object.keys(storage)[i] || null
    };
};

global.localStorage = storageMock();
global.sessionStorage = storageMock();

global.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
});

// Mock requestAnimationFrame for React
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Add missing globals needed by RTL
global.Node = window.Node;
global.Element = window.Element;
global.HTMLElement = window.HTMLElement;
global.HTMLButtonElement = window.HTMLButtonElement;
global.HTMLInputElement = window.HTMLInputElement;
global.HTMLSelectElement = window.HTMLSelectElement;
global.HTMLTextAreaElement = window.HTMLTextAreaElement;
global.Event = window.Event;
global.MouseEvent = window.MouseEvent;
global.KeyboardEvent = window.KeyboardEvent;

// For MongoAdapter/catalogApi
global.import = { meta: { env: { VITE_API_URL: 'http://localhost:3000/api' } } };
