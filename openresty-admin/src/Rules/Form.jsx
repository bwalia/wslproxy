import { Box, Card, CardContent, Divider, Grid, Typography, Alert } from "@mui/material";
import React from "react";
import {
  BooleanInput,
  NumberInput,
  SimpleForm,
  TextInput,
  SelectInput,
  required,
  FormDataConsumer,
  SelectArrayInput,
  ReferenceInput
} from "react-admin";
import Toolbar from "./toolbar/Toolbar";
import CreateTags from "../component/CreateTags";

const iso_codes = {
  AF: "Afghanistan",
  AL: "Albania",
  DZ: "Algeria",
  AS: "American Samoa",
  AD: "Andorra",
  AO: "Angola",
  AI: "Anguilla",
  AQ: "Antarctica",
  AG: "Antigua and Barbuda",
  AR: "Argentina",
  AM: "Armenia",
  AW: "Aruba",
  AU: "Australia",
  AT: "Austria",
  AZ: "Azerbaijan",
  BS: "Bahamas (the)",
  BH: "Bahrain",
  BD: "Bangladesh",
  BB: "Barbados",
  BY: "Belarus",
  BE: "Belgium",
  BZ: "Belize",
  BJ: "Benin",
  BM: "Bermuda",
  BT: "Bhutan",
  BO: "Bolivia (Plurinational State of)",
  BQ: "Bonaire, Sint Eustatius and Saba",
  BA: "Bosnia and Herzegovina",
  BW: "Botswana",
  BV: "Bouvet Island",
  BR: "Brazil",
  IO: "British Indian Ocean Territory (the)",
  BN: "Brunei Darussalam",
  BG: "Bulgaria",
  BF: "Burkina Faso",
  BI: "Burundi",
  CV: "Cabo Verde",
  KH: "Cambodia",
  CM: "Cameroon",
  CA: "Canada",
  KY: "Cayman Islands (the)",
  CF: "Central African Republic (the)",
  TD: "Chad",
  CL: "Chile",
  CN: "China",
  CX: "Christmas Island",
  CC: "Cocos (Keeling) Islands (the)",
  CO: "Colombia",
  KM: "Comoros (the)",
  CD: "Congo (the Democratic Republic of the)",
  CG: "Congo (the)",
  CK: "Cook Islands (the)",
  CR: "Costa Rica",
  HR: "Croatia",
  CU: "Cuba",
  CW: "Curaçao",
  CY: "Cyprus",
  CZ: "Czechia",
  CI: "Côte d'Ivoire",
  DK: "Denmark",
  DJ: "Djibouti",
  DM: "Dominica",
  DO: "Dominican Republic (the)",
  EC: "Ecuador",
  EG: "Egypt",
  SV: "El Salvador",
  GQ: "Equatorial Guinea",
  ER: "Eritrea",
  EE: "Estonia",
  SZ: "Eswatini",
  ET: "Ethiopia",
  FK: "Falkland Islands (the) [Malvinas]",
  FO: "Faroe Islands (the)",
  FJ: "Fiji",
  FI: "Finland",
  FR: "France",
  GF: "French Guiana",
  PF: "French Polynesia",
  TF: "French Southern Territories (the)",
  GA: "Gabon",
  GM: "Gambia (the)",
  GE: "Georgia",
  DE: "Germany",
  GH: "Ghana",
  GI: "Gibraltar",
  GR: "Greece",
  GL: "Greenland",
  GD: "Grenada",
  GP: "Guadeloupe",
  GU: "Guam",
  GT: "Guatemala",
  GG: "Guernsey",
  GN: "Guinea",
  GW: "Guinea-Bissau",
  GY: "Guyana",
  HT: "Haiti",
  HM: "Heard Island and McDonald Islands",
  VA: "Holy See (the)",
  HN: "Honduras",
  HK: "Hong Kong",
  HU: "Hungary",
  IS: "Iceland",
  IN: "India",
  ID: "Indonesia",
  IR: "Iran (Islamic Republic of)",
  IQ: "Iraq",
  IE: "Ireland",
  IM: "Isle of Man",
  IL: "Israel",
  IT: "Italy",
  JM: "Jamaica",
  JP: "Japan",
  JE: "Jersey",
  JO: "Jordan",
  KZ: "Kazakhstan",
  KE: "Kenya",
  KI: "Kiribati",
  KP: "Korea (the Democratic People's Republic of)",
  KR: "Korea (the Republic of)",
  KW: "Kuwait",
  KG: "Kyrgyzstan",
  LA: "Lao People's Democratic Republic (the)",
  LV: "Latvia",
  LB: "Lebanon",
  LS: "Lesotho",
  LR: "Liberia",
  LY: "Libya",
  LI: "Liechtenstein",
  LT: "Lithuania",
  LU: "Luxembourg",
  MO: "Macao",
  MG: "Madagascar",
  MW: "Malawi",
  MY: "Malaysia",
  MV: "Maldives",
  ML: "Mali",
  MT: "Malta",
  MH: "Marshall Islands (the)",
  MQ: "Martinique",
  MR: "Mauritania",
  MU: "Mauritius",
  YT: "Mayotte",
  MX: "Mexico",
  FM: "Micronesia (Federated States of)",
  MD: "Moldova (the Republic of)",
  MC: "Monaco",
  MN: "Mongolia",
  ME: "Montenegro",
  MS: "Montserrat",
  MA: "Morocco",
  MZ: "Mozambique",
  MM: "Myanmar",
  NA: "Namibia",
  NR: "Nauru",
  NP: "Nepal",
  NL: "Netherlands (the)",
  NC: "New Caledonia",
  NZ: "New Zealand",
  NI: "Nicaragua",
  NE: "Niger (the)",
  NG: "Nigeria",
  NU: "Niue",
  NF: "Norfolk Island",
  MP: "Northern Mariana Islands (the)",
  NO: "Norway",
  OM: "Oman",
  PK: "Pakistan",
  PW: "Palau",
  PS: "Palestine, State of",
  PA: "Panama",
  PG: "Papua New Guinea",
  PY: "Paraguay",
  PE: "Peru",
  PH: "Philippines (the)",
  PN: "Pitcairn",
  PL: "Poland",
  PT: "Portugal",
  PR: "Puerto Rico",
  QA: "Qatar",
  MK: "Republic of North Macedonia",
  RO: "Romania",
  RU: "Russian Federation (the)",
  RW: "Rwanda",
  RE: "Réunion",
  BL: "Saint Barthélemy",
  SH: "Saint Helena, Ascension and Tristan da Cunha",
  KN: "Saint Kitts and Nevis",
  LC: "Saint Lucia",
  MF: "Saint Martin (French part)",
  PM: "Saint Pierre and Miquelon",
  VC: "Saint Vincent and the Grenadines",
  WS: "Samoa",
  SM: "San Marino",
  ST: "Sao Tome and Principe",
  SA: "Saudi Arabia",
  SN: "Senegal",
  RS: "Serbia",
  SC: "Seychelles",
  SL: "Sierra Leone",
  SG: "Singapore",
  SX: "Sint Maarten (Dutch part)",
  SK: "Slovakia",
  SI: "Slovenia",
  SB: "Solomon Islands",
  SO: "Somalia",
  ZA: "South Africa",
  GS: "South Georgia and the South Sandwich Islands",
  SS: "South Sudan",
  ES: "Spain",
  LK: "Sri Lanka",
  SD: "Sudan (the)",
  SR: "Suriname",
  SJ: "Svalbard and Jan Mayen",
  SE: "Sweden",
  CH: "Switzerland",
  SY: "Syrian Arab Republic",
  TW: "Taiwan",
  TJ: "Tajikistan",
  TZ: "Tanzania, United Republic of",
  TH: "Thailand",
  TL: "Timor-Leste",
  TG: "Togo",
  TK: "Tokelau",
  TO: "Tonga",
  TT: "Trinidad and Tobago",
  TN: "Tunisia",
  TR: "Turkey",
  TM: "Turkmenistan",
  TC: "Turks and Caicos Islands (the)",
  TV: "Tuvalu",
  UG: "Uganda",
  UA: "Ukraine",
  AE: "United Arab Emirates (the)",
  GB: "United Kingdom of Great Britain and Northern Ireland (the)",
  UM: "United States Minor Outlying Islands (the)",
  US: "United States of America (the)",
  UY: "Uruguay",
  UZ: "Uzbekistan",
  VU: "Vanuatu",
  VE: "Venezuela (Bolivarian Republic of)",
  VN: "Viet Nam",
  VG: "Virgin Islands (British)",
  VI: "Virgin Islands (U.S.)",
  WF: "Wallis and Futuna",
  EH: "Western Sahara",
  YE: "Yemen",
  ZM: "Zambia",
  ZW: "Zimbabwe",
  AX: "Åland Islands",
  EU: "All European Countries",
};

const euCountries = `AD, AL, AT, AX, BA, BE, BG, BY, CH, CZ, DE, DK, EE, ES, FI, FO, FR, GB, GG, GI, GR, HR, HU, IE, IM, IS, IT, JE, LI, LT, LU, LV, MC, MD, ME, MK, MT, NL, NO, PL, PT, RO, RS, RU, SE, SI, SJ, SK, SM, UA, VA`;

const objectToArray = (obj = {}) => {
  const res = [];
  for (var key in obj) {
    res.push({
      id: key,
      name: obj[key] + " (" + key + ")"
    });
  }
  return res;
};

// Section Card component for consistent styling
const SectionCard = ({ title, subtitle, children }) => (
  <Card variant="outlined" sx={{ mb: 3, width: '100%' }}>
    <CardContent>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        {title}
      </Typography>
      {subtitle && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {subtitle}
        </Typography>
      )}
      {!subtitle && <Box sx={{ mb: 1 }} />}
      {children}
    </CardContent>
  </Card>
);

// Sub-section label
const SubSectionLabel = ({ children }) => (
  <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary', mb: 1 }}>
    {children}
  </Typography>
);

const Form = () => {
  const secretTags = localStorage.getItem('rules.tags') || "";

  const [choices, setChoices] = React.useState([]);
  React.useEffect(() => {
    if (secretTags && secretTags != "undefined") {
      const tags = JSON.parse(secretTags);
      const prevTags = tags.map((tag) => ({ id: tag, name: tag }));
      setChoices(prevTags);
    }
  }, [secretTags]);

  const handleProfileChange = (e) => {
    localStorage.setItem('environment', e.target.value);
  }

  const countryChoices = objectToArray(iso_codes);

  return (
    <SimpleForm toolbar={<Toolbar />}>
      <Box sx={{ width: '100%', maxWidth: 1200, py: 1 }}>

        {/* Basic Rule Information */}
        <SectionCard title="Basic Rule Information" subtitle="Configure the rule name, profile, and metadata">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={4}>
              <TextInput
                source="name"
                label="Rule Name"
                validate={[required()]}
                fullWidth
                helperText="Unique name for this rule"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <ReferenceInput source="profile_id" reference="profiles">
                <SelectInput
                  fullWidth
                  optionText="name"
                  onChange={handleProfileChange}
                  validate={[required()]}
                  helperText="Environment profile"
                />
              </ReferenceInput>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <SelectArrayInput
                source="rules_tags"
                choices={choices}
                create={<CreateTags choices={choices} />}
                fullWidth
                helperText="Organization tags"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <NumberInput
                source="version"
                defaultValue={1}
                fullWidth
                helperText="Rule version"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <NumberInput
                source="priority"
                defaultValue={1}
                fullWidth
                helperText="Execution priority"
              />
            </Grid>
          </Grid>
        </SectionCard>

        {/* Match Rules */}
        <SectionCard title="Match Rules" subtitle="Define conditions for when this rule should be applied">

          {/* URL Path Matching */}
          <Box sx={{ mb: 3 }}>
            <SubSectionLabel>URL Path Matching</SubSectionLabel>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <SelectInput
                  defaultValue="starts_with"
                  source="match.rules.path_key"
                  fullWidth
                  label="Match Type"
                  choices={[
                    { id: "starts_with", name: "Starts With" },
                    { id: "ends_with", name: "Ends With" },
                    { id: "equals", name: "Equals" },
                  ]}
                  helperText="How to match the URL path"
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextInput
                  source="match.rules.path"
                  validate={[required()]}
                  label="URL Path Value"
                  fullWidth
                  helperText="The path pattern to match (e.g., /api/, .php)"
                />
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Geographic Filtering */}
          <Box sx={{ mb: 3 }}>
            <SubSectionLabel>Geographic Filtering</SubSectionLabel>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <SelectInput
                  defaultValue="equals"
                  source="match.rules.country_key"
                  fullWidth
                  label="Match Type"
                  choices={[{ id: "equals", name: "Equals" }]}
                  helperText="Country matching operator"
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <SelectInput
                  source="match.rules.country"
                  label="Country"
                  fullWidth
                  choices={countryChoices}
                  helperText="Select a country to filter"
                />
                <FormDataConsumer>
                  {({ formData }) => formData?.match?.rules?.country === "EU" && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      <Typography variant="caption">
                        EU includes: {euCountries}
                      </Typography>
                    </Alert>
                  )}
                </FormDataConsumer>
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Client IP Filtering */}
          <Box sx={{ mb: 3 }}>
            <SubSectionLabel>Client IP Filtering</SubSectionLabel>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <SelectInput
                  defaultValue="equals"
                  source="match.rules.client_ip_key"
                  fullWidth
                  label="Match Type"
                  choices={[
                    { id: "equals", name: "Equals" },
                    { id: "starts_with", name: "Starts With" },
                    { id: "ipheader", name: "Get IP from Header" },
                  ]}
                  helperText="IP matching method"
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <TextInput
                  source="match.rules.client_ip"
                  label="Client IP Value"
                  fullWidth
                  helperText="IP address or pattern to match"
                />
              </Grid>
            </Grid>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Token Validation */}
          <Box>
            <SubSectionLabel>Token Validation</SubSectionLabel>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <SelectInput
                  defaultValue="equals"
                  source="match.rules.jwt_token_validation"
                  choices={[
                    { id: "equals", name: "None (=)" },
                    { id: "cookie_jwt_token_validation", name: "Cookie JWT Token" },
                    { id: "cookie_key_value", name: "Cookie Key Value" },
                    { id: "header_jwt_token_validation", name: "Header JWT Token" },
                    { id: "amazon_s3_signed_header_validation", name: "Amazon S3 Signed Header" },
                  ]}
                  fullWidth
                  label="Validation Type"
                  helperText="Token validation method"
                />
              </Grid>
              <Grid item xs={12} sm={8}>
                <FormDataConsumer>
                  {({ formData }) => (
                    <TextInput
                      source="match.rules.jwt_token_validation_value"
                      fullWidth
                      label={formData?.match?.rules?.jwt_token_validation === "amazon_s3_signed_header_validation" ? "Bucket Name" : "Token Value"}
                      helperText={formData?.match?.rules?.jwt_token_validation === "amazon_s3_signed_header_validation" ? "S3 bucket name" : "Token to validate"}
                    />
                  )}
                </FormDataConsumer>
              </Grid>

              <FormDataConsumer>
                {({ formData }) => formData?.match?.rules?.jwt_token_validation_value && (
                  <Grid item xs={12}>
                    <TextInput
                      source="match.rules.jwt_token_validation_key"
                      fullWidth
                      label={formData?.match?.rules?.jwt_token_validation === "amazon_s3_signed_header_validation" ? "Bucket File Paths" : "Token Secret Key"}
                      type={formData?.match?.rules?.jwt_token_validation === "amazon_s3_signed_header_validation" ? "text" : "password"}
                      inputProps={{ autoComplete: "new-password" }}
                      helperText={formData?.match?.rules?.jwt_token_validation === "amazon_s3_signed_header_validation" ? "Comma-separated file paths" : "Secret key for validation"}
                    />
                  </Grid>
                )}
              </FormDataConsumer>

              <FormDataConsumer>
                {({ formData }) => (
                  formData?.match?.rules?.jwt_token_validation_key &&
                  formData?.match?.rules?.jwt_token_validation === "amazon_s3_signed_header_validation"
                ) && (
                  <>
                    <Grid item xs={12} sm={6}>
                      <TextInput
                        source="match.rules.amazon_s3_access_key"
                        fullWidth
                        label="Amazon S3 Access Key"
                        type="password"
                        helperText="AWS access key ID"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextInput
                        source="match.rules.amazon_s3_secret_key"
                        fullWidth
                        label="Amazon S3 Secret Key"
                        type="password"
                        helperText="AWS secret access key"
                      />
                    </Grid>
                  </>
                )}
              </FormDataConsumer>
            </Grid>
          </Box>
        </SectionCard>

        {/* Response Configuration */}
        <SectionCard title="Response Configuration" subtitle="Define the response behavior when this rule matches">
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <BooleanInput
                source="match.response.allow"
                label="Allow Request"
                defaultValue={false}
                helperText="Allow or block the request"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <NumberInput
                source="match.response.code"
                label="Response Code"
                defaultValue={403}
                fullWidth
                helperText="HTTP status code"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <FormDataConsumer>
                {({ formData }) => (
                  <TextInput
                    source="match.response.redirect_uri"
                    label={
                      formData?.match?.response?.code >= 301 && formData?.match?.response?.code <= 305
                        ? "Redirect URL (Required)"
                        : "Proxy Pass / Redirect URL"
                    }
                    fullWidth
                    validate={
                      formData?.match?.response?.code >= 301 && formData?.match?.response?.code <= 305
                        ? [required()]
                        : []
                    }
                    helperText="Target URL for redirect or proxy"
                  />
                )}
              </FormDataConsumer>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Consul Configuration */}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3}>
              <BooleanInput
                source="match.response.is_consul"
                label="Use Consul"
                defaultValue={false}
                helperText="Enable Consul integration"
              />
            </Grid>
            <FormDataConsumer>
              {({ formData }) => formData?.match?.response?.is_consul && (
                <Grid item xs={12} sm={6} md={9}>
                  <TextInput
                    source="match.response.consul_domain_name"
                    label="Consul Domain Name"
                    fullWidth
                    validate={[required()]}
                    helperText="Consul service domain"
                  />
                </Grid>
              )}
            </FormDataConsumer>
          </Grid>

          <Divider sx={{ my: 2 }} />

          {/* Response Message */}
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextInput
                multiline
                source="match.response.message"
                label="Response Message"
                fullWidth
                minRows={3}
                helperText="Base64 encoded response body (optional)"
              />
            </Grid>
          </Grid>
        </SectionCard>

      </Box>
    </SimpleForm>
  );
};

export default Form;
