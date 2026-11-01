# Motion routing

Use CSS transitions-dev patterns for panel reveal, number updates, loading skeletons, shimmer labels, hover feedback, and state swaps. Preserve the supplied reduced-motion media query.

Use GSAP only for cross-panel or map-scope sequences that need a timeline, interruption, cleanup, and exact completion state. For React:

- keep timeline ownership inside the renderer/component lifecycle;
- kill the previous timeline before a new drilldown/back transition;
- restore the exact final camera/group state on interruption;
- kill timelines and tweens on unmount;
- skip continuous motion and reduce duration to zero when `prefers-reduced-motion` matches.

Map render-loop effects stop under reduced motion. A static visible end state remains for fly lines, scatter, and columns.
