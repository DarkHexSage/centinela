// Paquetes muy populares. Sirven para dos cosas:
// 1) No gastar una consulta de red en paquetes obviamente legítimos.
// 2) Detectar typosquatting: nombres "casi iguales" a uno de estos.

export const POPULAR_NPM = [
  'react', 'react-dom', 'next', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', 'angular', '@angular/core',
  'express', 'fastify', 'koa', 'hono', 'nestjs', '@nestjs/core', 'axios', 'node-fetch', 'got', 'ky',
  'lodash', 'lodash-es', 'underscore', 'ramda', 'moment', 'dayjs', 'date-fns', 'luxon',
  'typescript', 'ts-node', 'tsx', 'esbuild', 'vite', 'webpack', 'webpack-cli', 'rollup', 'parcel',
  'babel-loader', '@babel/core', '@babel/preset-env', 'eslint', 'prettier', 'jest', 'vitest', 'mocha',
  'chai', 'playwright', '@playwright/test', 'puppeteer', 'cypress', 'nodemon', 'concurrently',
  'dotenv', 'cross-env', 'zod', 'yup', 'joi', 'ajv', 'class-validator', 'uuid', 'nanoid',
  'chalk', 'commander', 'yargs', 'inquirer', 'ora', 'debug', 'winston', 'pino', 'morgan',
  'cors', 'helmet', 'body-parser', 'cookie-parser', 'express-session', 'passport', 'jsonwebtoken',
  'bcrypt', 'bcryptjs', 'argon2', 'mongoose', 'mongodb', 'pg', 'mysql2', 'sqlite3', 'better-sqlite3',
  'redis', 'ioredis', 'prisma', '@prisma/client', 'drizzle-orm', 'drizzle-kit', 'sequelize', 'typeorm',
  'knex', '@supabase/supabase-js', '@supabase/ssr', 'firebase', 'firebase-admin', 'stripe',
  '@stripe/stripe-js', 'openai', '@anthropic-ai/sdk', '@modelcontextprotocol/sdk', 'ai', '@ai-sdk/openai',
  'langchain', '@langchain/core', 'socket.io', 'socket.io-client', 'ws', 'graphql', '@apollo/client',
  'apollo-server', 'tailwindcss', 'postcss', 'autoprefixer', 'sass', 'styled-components', '@emotion/react',
  'clsx', 'classnames', 'tailwind-merge', 'lucide-react', 'react-icons', 'framer-motion',
  'react-router', 'react-router-dom', 'react-hook-form', '@tanstack/react-query', 'swr', 'redux',
  '@reduxjs/toolkit', 'react-redux', 'zustand', 'jotai', 'recoil', 'mobx', 'immer', 'rxjs',
  'three', 'd3', 'chart.js', 'recharts', 'echarts', 'leaflet', 'mapbox-gl', 'sharp', 'jimp',
  'multer', 'formidable', 'nodemailer', 'resend', 'twilio', '@sendgrid/mail', 'aws-sdk',
  '@aws-sdk/client-s3', 'googleapis', 'cheerio', 'jsdom', 'marked', 'markdown-it', 'highlight.js',
  'semver', 'glob', 'rimraf', 'fs-extra', 'mkdirp', 'chokidar', 'execa', 'shelljs', 'yaml', 'js-yaml',
  'qs', 'query-string', 'validator', 'xlsx', 'pdfkit', 'pdf-lib', 'jspdf', 'xml2js',
  'fast-xml-parser', 'sanitize-html', 'dompurify', 'isomorphic-dompurify', 'next-auth', '@auth/core',
  'clerk', '@clerk/nextjs', 'react-native', 'expo', 'electron', 'husky', 'lint-staged', 'turbo',
  'nx', 'lerna', 'pm2', 'serve', 'http-server', 'colors', 'eventemitter3', 'async', 'bluebird',
  'request', 'superagent', 'supertest', 'sinon', 'nock', 'msw', 'faker', '@faker-js/faker',
  'shadcn', 'radix-ui', '@radix-ui/react-dialog', 'vercel', 'wrangler', 'netlify-cli'
];

export const POPULAR_PYPI = [
  'requests', 'urllib3', 'httpx', 'aiohttp', 'flask', 'django', 'fastapi', 'starlette', 'uvicorn',
  'gunicorn', 'celery', 'redis', 'sqlalchemy', 'alembic', 'psycopg2', 'psycopg2-binary', 'psycopg',
  'pymysql', 'pymongo', 'motor', 'pydantic', 'pydantic-settings', 'marshmallow', 'numpy', 'pandas',
  'scipy', 'matplotlib', 'seaborn', 'plotly', 'scikit-learn', 'tensorflow', 'torch', 'torchvision',
  'keras', 'transformers', 'datasets', 'tokenizers', 'accelerate', 'sentence-transformers',
  'openai', 'anthropic', 'langchain', 'langchain-core', 'langchain-openai', 'llama-index', 'tiktoken',
  'mcp', 'fastmcp', 'boto3', 'botocore', 'awscli', 'google-cloud-storage', 'google-api-python-client',
  'azure-identity', 'azure-storage-blob', 'pytest', 'pytest-cov', 'pytest-asyncio', 'tox', 'nox',
  'black', 'ruff', 'flake8', 'pylint', 'mypy', 'isort', 'pre-commit', 'click', 'typer', 'rich',
  'tqdm', 'colorama', 'python-dotenv', 'pyyaml', 'toml', 'tomli', 'jinja2', 'markupsafe', 'werkzeug',
  'itsdangerous', 'beautifulsoup4', 'lxml', 'selenium', 'playwright', 'scrapy', 'pillow', 'opencv-python',
  'pyjwt', 'cryptography', 'bcrypt', 'passlib', 'paramiko', 'fabric', 'ansible', 'docker', 'kubernetes',
  'python-dateutil', 'pytz', 'arrow', 'pendulum', 'six', 'setuptools', 'wheel', 'pip', 'virtualenv',
  'poetry', 'pipenv', 'uv', 'jupyter', 'notebook', 'ipython', 'ipykernel', 'streamlit', 'gradio',
  'dash', 'polars', 'pyarrow', 'openpyxl', 'xlrd', 'reportlab', 'pypdf', 'pypdf2', 'pdfplumber',
  'stripe', 'twilio', 'sendgrid', 'supabase', 'firebase-admin', 'sentry-sdk', 'loguru', 'structlog',
  'httpcore', 'websockets', 'grpcio', 'protobuf', 'msgpack', 'orjson', 'ujson', 'simplejson',
  'attrs', 'dataclasses-json', 'cachetools', 'tenacity', 'backoff', 'networkx', 'sympy', 'nltk', 'spacy'
];

export function normalizePypi(name) {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

export const POPULAR_NPM_SET = new Set(POPULAR_NPM);
export const POPULAR_PYPI_SET = new Set(POPULAR_PYPI.map(normalizePypi));
