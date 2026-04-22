const fs = require('fs');
const reg = JSON.parse(fs.readFileSync('C:/Users/jwpmi/Downloads/CieloVistaStandards/project-registry.json','utf8'));
console.log('registry entries:', reg.projects.length);
console.log('jesus entry present:', !!reg.projects.find(p => p.name === 'JesusFamilyTree'));
console.log('leftover test entries:', reg.projects.filter(p => p.name.startsWith('__promote_test_')).length);
console.log('all status values:', [...new Set(reg.projects.map(p => p.status))].join(', '));
