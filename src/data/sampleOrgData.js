export const sampleOrgData = {
  name: 'Alex Johnson',
  title: 'Chief Executive Officer',
  id: 'ceo',
  children: [
    {
      name: 'Jordan Smith',
      title: 'VP of Engineering',
      id: 'vp-engineering',
      children: [
        {
          name: 'Priya Patel',
          title: 'Director of Platform',
          id: 'director-platform',
          children: [
            {
              name: 'Diego Hernandez',
              title: 'Engineering Manager, API',
              id: 'manager-api',
            },
            {
              name: 'Li Wei',
              title: 'Engineering Manager, Data',
              id: 'manager-data',
            },
          ],
        },
        {
          name: 'Sofia Rossi',
          title: 'Director of Applications',
          id: 'director-apps',
          children: [
            {
              name: 'Amelia Brown',
              title: 'Product Engineering Manager',
              id: 'manager-product',
            },
            {
              name: 'Noah Williams',
              title: 'QA Engineering Manager',
              id: 'manager-qa',
            },
          ],
        },
      ],
    },
    {
      name: 'Taylor Nguyen',
      title: 'VP of Product',
      id: 'vp-product',
      children: [
        {
          name: 'Emma Martinez',
          title: 'Director of Product Strategy',
          id: 'director-product-strategy',
          children: [
            {
              name: 'Oliver Davis',
              title: 'Senior Product Manager',
              id: 'spm-1',
            },
            {
              name: 'Sophia Garcia',
              title: 'Senior Product Manager',
              id: 'spm-2',
            },
          ],
        },
        {
          name: 'Mason Clark',
          title: 'Director of UX Research',
          id: 'director-ux-research',
          children: [
            {
              name: 'Isabella Lopez',
              title: 'Lead UX Researcher',
              id: 'lead-uxr',
            },
          ],
        },
      ],
    },
    {
      name: 'Morgan Lee',
      title: 'VP of Operations',
      id: 'vp-operations',
      children: [
        {
          name: 'William Thompson',
          title: 'Director of Finance',
          id: 'director-finance',
          children: [
            {
              name: 'Harper Wilson',
              title: 'Accounting Manager',
              id: 'manager-accounting',
            },
          ],
        },
        {
          name: 'Avery Kim',
          title: 'Director of People Operations',
          id: 'director-people',
          children: [
            {
              name: 'Ethan Walker',
              title: 'People Operations Manager',
              id: 'manager-people',
            },
            {
              name: 'Mia Chen',
              title: 'Recruiting Manager',
              id: 'manager-recruiting',
            },
          ],
        },
      ],
    },
  ],
};
