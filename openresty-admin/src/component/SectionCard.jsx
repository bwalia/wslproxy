import React from "react";
import { Card, CardContent, Typography } from "@mui/material";

/**
 * The bordered card every server form section sits in.
 *
 * Lifted out of Servers/Form.jsx so the API Gateway tab can use the same
 * shell without importing Form.jsx (which imports the tab — that way round
 * is a cycle). Behaviour is unchanged; the class names still come from
 * Servers/../styles/forms.css.
 */
export const SectionCard = ({ title, subtitle, children, noPadding = false }) => (
  <Card
    variant="outlined"
    className={`section-card${noPadding ? " section-card--no-padding" : ""}`}
  >
    <CardContent>
      <Typography variant="subtitle1" className="section-card__title">
        {title}
      </Typography>
      {subtitle && (
        <Typography
          variant="body2"
          color="text.secondary"
          className="section-card__subtitle"
        >
          {subtitle}
        </Typography>
      )}
      {!subtitle && <div className="section-card__spacer" />}
      {children}
    </CardContent>
  </Card>
);

/** Muted label for a group of inputs inside a SectionCard. */
export const SubSectionLabel = ({ children }) => (
  <Typography
    variant="body2"
    color="text.secondary"
    className="sub-section-label"
  >
    {children}
  </Typography>
);

export default SectionCard;
