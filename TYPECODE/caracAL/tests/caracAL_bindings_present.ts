// If this file compile the test is passed
setInterval(
  () =>
    console.log(
      "All my friends are " + (parent.caracAL?.siblings || []).join(", "),
    ),
  5000,
);
