
module.exports = exports = ({ id, date }) => `---
id: "${id}"
date: "${date.toISOString()}"
title: ""
description: "Outfit of the Day for ${date.format('MMM Do, YYYY')}"
tags:
  - OOTD
products:
  "Description": https://www.amazon.com/exec/obidos/ASIN/A000000000/curvyandtrans-20
---
`;
