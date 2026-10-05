export const SNIPPETS: Record<string, string> = {
  "Mermaid · Flowchart": "\n```mermaid\nflowchart TD\n  A[Start] --> B{Condition?}\n  B -- yes --> C[Do this]\n  B -- no --> D[Do that]\n  C --> E[End]\n  D --> E\n```\n",
  "Mermaid · Sequence": "\n```mermaid\nsequenceDiagram\n  Client->>API: request\n  API->>DB: query\n  DB-->>API: rows\n  API-->>Client: response\n```\n",
  "Mermaid · Class": "\n```mermaid\nclassDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  class Dog\n  Animal <|-- Dog\n  Animal \"1\" --> \"*\" Toy : owns\n```\n",
  "Mermaid · State": "\n```mermaid\nstateDiagram-v2\n  [*] --> LoggedOut\n  LoggedOut --> LoggedIn: login\n  LoggedIn --> LoggedOut: logout\n  LoggedIn --> [*]\n```\n",
  "Mermaid · ER": "\n```mermaid\nerDiagram\n  USER ||--o{ ORDER : places\n  ORDER ||--|{ ITEM : contains\n  USER {\n    int id\n    string name\n  }\n```\n",
  "Mermaid · User journey": "\n```mermaid\njourney\n  title My working day\n  section Morning\n    Make tea: 5: Me\n    Read papers: 3: Me\n  section Afternoon\n    Code: 4: Me, Team\n    Meetings: 2: Me, Team\n```\n",
  "Mermaid · Gantt": "\n```mermaid\ngantt\n  title Project plan\n  dateFormat YYYY-MM-DD\n  section Phase 1\n  Research :a1, 2026-01-01, 7d\n  Prototype :after a1, 10d\n  section Phase 2\n  Test :2026-01-20, 5d\n```\n",
  "Mermaid · Pie": "\n```mermaid\npie showData title Market share\n  \"A\" : 45\n  \"B\" : 30\n  \"C\" : 25\n```\n",
  "Mermaid · Git graph": "\n```mermaid\ngitGraph\n  commit\n  branch feature\n  checkout feature\n  commit\n  commit\n  checkout main\n  merge feature\n  commit\n```\n",
  "Mermaid · Mind map": "\n```mermaid\nmindmap\n  root((Topic))\n    Branch A\n      Idea 1\n      Idea 2\n    Branch B\n      Idea 3\n```\n",
  "Mermaid · Timeline": "\n```mermaid\ntimeline\n  title Project history\n  2024 : Idea\n  2025 : Prototype : First users\n  2026 : Launch\n```\n",
  "Mermaid · Quadrant chart": "\n```mermaid\nquadrantChart\n  title Priority matrix\n  x-axis Low effort --> High effort\n  y-axis Low impact --> High impact\n  quadrant-1 Plan\n  quadrant-2 Do first\n  quadrant-3 Drop\n  quadrant-4 Delegate\n  Task A: [0.2, 0.8]\n  Task B: [0.7, 0.6]\n  Task C: [0.4, 0.2]\n```\n",
  "Mermaid · XY chart": "\n```mermaid\nxychart-beta\n  title \"Sales\"\n  x-axis [jan, feb, mar, apr]\n  y-axis \"Revenue\" 0 --> 100\n  bar [50, 60, 75, 82]\n  line [50, 60, 75, 82]\n```\n",
  "Mermaid · Architecture": "\n```mermaid\narchitecture-beta\n  group api(cloud)[API]\n  service db(database)[Database] in api\n  service server(server)[Server] in api\n  service disk(disk)[Storage] in api\n  db:L -- R:server\n  disk:T -- B:server\n```\n",
  "Math (block)": "\n$$\n\\frac{\\partial \\psi}{\\partial t} = \\frac{i\\hbar}{2m}\\nabla^2\\psi\n$$\n",
  "Math (inline)": "$E = mc^2$",
  "Line chart (CSV)": "\n```chart\ntype: line\ntitle: Decay\nxlabel: t (s)\nylabel: N\n---\nt,measured,model\n0,100,100\n1,61,60.6\n2,38,36.8\n3,23,22.3\n4,14,13.5\n5,9,8.2\n```\n",
  "Scatter (CSV)": "\n```chart\ntype: scatter\ntitle: Data\n---\nx,y\n1,2.1\n2,3.9\n3,6.2\n4,7.8\n5,10.1\n```\n",
  "Bar chart (CSV)": "\n```chart\ntype: bar\ntitle: Accuracy by model\n---\nmodel,train,test\nA,0.92,0.88\nB,0.95,0.84\nC,0.90,0.89\n```\n",
  "Function plot": "\n```plot\ntitle: Damped oscillation\nx: 0..20\ny = exp(-x/6)*cos(2*x)\ny = exp(-x/6)\ny = -exp(-x/6)\n```\n",
  "Table": "\n| Quantity | Symbol | Unit |\n|---|---|---|\n| Force | F | N |\n| Energy | E | J |\n",
  "Code (python)": "\n```python\nimport numpy as np\n\nx = np.linspace(0, 1, 100)\nprint(x.mean())\n```\n",
  "Checklist": "\n- [ ] Task one\n- [ ] Task two\n",
};

export const TEMPLATES: Record<string, { title: string; body: string }> = {
  "Physics lab": {
    title: "Experiment – ",
    body: `## Objective\n\n## Theory\n$$ F = ma $$\n\n## Setup\n\`\`\`mermaid\nflowchart LR\n  Source --> Sample --> Detector --> DAQ\n\`\`\`\n\n## Data\n\`\`\`chart\ntype: scatter\ntitle: Measurements\nxlabel: x\nylabel: y\n---\nx,y\n1,2.0\n2,4.1\n3,5.9\n\`\`\`\n\n## Analysis\n\n## Conclusion\n`,
  },
  "Data analysis": {
    title: "Analysis – ",
    body: `## Question\n\n## Data\n| column | type | notes |\n|---|---|---|\n\n## Method\n\`\`\`python\nimport pandas as pd\ndf = pd.read_csv("data.csv")\n\`\`\`\n\n## Results\n\`\`\`chart\ntype: bar\ntitle: Metric\n---\ngroup,value\nA,1\nB,2\n\`\`\`\n\n## Next steps\n- [ ] \n`,
  },
  "System design": {
    title: "Design – ",
    body: `## Problem\n\n## Architecture\n\`\`\`mermaid\nflowchart TD\n  UI --> API --> DB[(Database)]\n  API --> Queue --> Worker\n\`\`\`\n\n## Trade-offs\n\n## Plan\n\`\`\`mermaid\ngantt\n  dateFormat YYYY-MM-DD\n  section Build\n  Prototype :2026-01-01, 7d\n\`\`\`\n`,
  },
  "Daily log": { title: new Date().toDateString(), body: "## Done\n- \n\n## Ideas\n- \n\n## Tomorrow\n- [ ] \n" },
};
