# AI Optimization & Engineering Report

**Name:** Mihiranga Dissanayake
**Project:** ApparelFlow ERP - Cutting Verification Gate
**Role:** Software Engineering Intern

This document outlines the AI-assisted development workflow used during this 4-day sprint. My core philosophy is that AI accelerates code generation, but structural integrity and security boundaries must be strictly engineered and audited by a human developer.

---

### 1. Tools & Prompting

- **Primary AI Model:** DeepSeek V4.1 Flash
- **Environment:** Chatbox
- **Prompting Strategy:**
  - Used AI primarily for coding React components, coding business logics that used in the system, generating Tailwind CSS boilerplate, and drafting the initial SQL schema for the required tables.

### 2. Flawed/Broken AI Code

- **Tailwind v3/v4 tooling missmatch:** Deepseek provided outdated setup instructions to install Tailwind CSS v3. However, when initializing Shadcn UI, it automaticaly generated modern v4 CSS variables. This causing the application to crash with a compile time error stating that the color 'border-border' did not exist.

### 3. Human Refactoring

- **Manual Tailwind v4 Upgrade:** Instead of asking the AI to fix the broken CSS, I manually remove the outdated v3 configuration and upgraded the entire project to Tailwind v4 stack.

### 4. Defensive Architecture
