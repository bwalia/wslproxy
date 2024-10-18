import { Grid } from "@mui/material";
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
};
const objectToArray = (obj = {}) => {
  const res = [];
  const keys = Object.keys(obj);
  for (var key in obj) {
    const myobj = {};
    myobj["id"] = key;
    myobj["name"] = obj[key] + " (" + key + ")";
    res.push(myobj);
  }
  return res;
};

const Form = () => {
  const secretTags = localStorage.getItem('rules.tags') || "";

  const [choices, setChoices] = React.useState([]);
  React.useEffect(() => {
    if (secretTags && secretTags != "undefined") {
      const tags = JSON.parse(secretTags);
      const prevTags = tags.map((tag) => { return { id: tag, name: tag } })
      setChoices(prevTags);
    }
  }, [secretTags]);
  const handleProfileChange = (e) => {
    localStorage.setItem('environment', e.target.value);
  }
  const mynewobj = objectToArray(iso_codes);
  return (
    <SimpleForm toolbar={<Toolbar />}>
      <h3>Enter the Rule below:</h3>
      <Grid container spacing={2}>
        <Grid item xs={3}>
          <TextInput
            source="name"
            label="Rule Name"
            validate={[required()]}
            fullWidth
          />
        </Grid>
        <Grid item xs={3}>
          <ReferenceInput source="profile_id" reference="profiles" >
            <SelectInput
              sx={{ marginTop: "0", marginBottom: "0" }}
              fullWidth
              optionText="name"
              onChange={handleProfileChange}
              validate={[required()]}
            />
          </ReferenceInput>
        </Grid>
        <Grid item xs={2}>
          <SelectArrayInput
            source="rules_tags"
            choices={choices}
            create={<CreateTags choices={choices} />}
          />
        </Grid>
        <Grid item xs={2}>
          <NumberInput source="version" defaultValue={1} fullWidth />
        </Grid>
        <Grid item xs={2}>
          <NumberInput source="priority" defaultValue={1} fullWidth />
        </Grid>

        <Grid item xs={6}>
          <SelectInput
            sx={{ marginTop: "0", marginBottom: "0" }}
            defaultValue={"starts_with"}
            source="match.rules.path_key"
            fullWidth
            label="URL Path"
            choices={[
              { id: "starts_with", name: "Starts With" },
              { id: "ends_with", name: "Ends With" },
              { id: "equals", name: "Equals" },
            ]}
            showEmptyOption={false}
            className="matchRulePathKey"
          />
        </Grid>

        <Grid item xs={6}>
          <TextInput
            source="match.rules.path"
            validate={[required()]}
            label="Value"
            fullWidth
            className="matchRulePath"
          />
        </Grid>

        <Grid item xs={6}>
          <SelectInput
            sx={{ marginTop: "0", marginBottom: "0" }}
            defaultValue={"equals"}
            source="match.rules.country_key"
            fullWidth
            label="Client Country"
            choices={[{ id: "equals", name: "=" }]}
            showEmptyOption={false}
            className="matchRuleCountryKey"
          />
        </Grid>

        <Grid item xs={6}>
          <SelectInput
            sx={{ marginTop: "0", marginBottom: "0" }}
            source="match.rules.country"
            label="Value"
            fullWidth
            choices={mynewobj}
            className="matchRuleCountry"
          />
        </Grid>

        <Grid item xs={6}>
          <SelectInput
            sx={{ marginTop: "0", marginBottom: "0" }}
            defaultValue={"equals"}
            source="match.rules.client_ip_key"
            fullWidth
            label="Client IP"
            choices={[
              { id: "equals", name: "=" },
              { id: "starts_with", name: "Starts With" },
            ]}
            className="matchRuleClientIpKey"
          />
        </Grid>

        <Grid item xs={6}>
          <TextInput source="match.rules.client_ip" className="matchRuleClientIp" label="Value" fullWidth />
        </Grid>

        <Grid item xs={6}>
          <SelectInput
            sx={{ marginTop: "0", marginBottom: "0" }}
            defaultValue={"equals"}
            source="match.rules.jwt_token_validation"
            choices={[
              { id: "equals", name: "=" },
              // { id: "basic", name: "Basic Auth" },
              { id: "cookie_jwt_token_validation", name: "Cookie header JWT Token validation" },
              { id: "cookie_key_value", name: "Cookie Key Value validation" },
              // { id: "redis", name: "Redis token validation" },
              { id: "header_jwt_token_validation", name: "Header JWT Token validation" },
              { id: "amazon_s3_signed_header_validation", name: "Amazon S3 Signed Header validation" },
            ]}
            fullWidth
            label="Token Validation"
            className="matchRuleJwtTokenValidation"
          />
        </Grid>

        <Grid item xs={6}>
          <FormDataConsumer>
            {({ formData, ...rest }) => (
              <React.Fragment>
                {formData?.match?.rules?.jwt_token_validation == "amazon_s3_signed_header_validation" ? (
                  <TextInput
                    source="match.rules.jwt_token_validation_value"
                    fullWidth
                    label="Bucket Name"
                    className="matchRuleJwtTokenValidationValue"
                  />
                ) : (
                  <TextInput
                    source="match.rules.jwt_token_validation_value"
                    fullWidth
                    label="Value"
                    className="matchRuleJwtTokenValidationValue"
                  />
                )}
              </React.Fragment>
            )}
          </FormDataConsumer>
        </Grid>

        <Grid item xs={12}>
          <FormDataConsumer>
            {({ formData, ...rest }) => (
              <React.Fragment>
                {formData.match?.rules?.jwt_token_validation_value && (
                  <TextInput
                    source="match.rules.jwt_token_validation_key"
                    fullWidth
                    label={formData?.match?.rules?.jwt_token_validation == "amazon_s3_signed_header_validation" ? "Bucket File Paths" : "Token Secret Key"}
                    type={formData?.match?.rules?.jwt_token_validation == "amazon_s3_signed_header_validation" ? "text" : "password"}
                    inputProps={{ autoComplete: "new-password" }}
                    className="matchRuleJwtTokenValidationKey"
                  />
                )}
              </React.Fragment>
            )}
          </FormDataConsumer>
        </Grid>

        <React.Fragment>
          <FormDataConsumer>
            {({ formData, ...rest }) => (
              <React.Fragment>
                {(formData?.match?.rules?.jwt_token_validation_key && formData?.match?.rules?.jwt_token_validation == "amazon_s3_signed_header_validation") && (
                  <React.Fragment>
                    <Grid item xs={6}>
                      <TextInput
                        source="match.rules.amazon_s3_access_key"
                        fullWidth
                        label="Amazon S3 Access key"
                        className="matchRuleAmazonS3AccessKey"
                        type="password"
                      />
                    </Grid>
                    <Grid item xs={6}>
                      <TextInput
                        source="match.rules.amazon_s3_secret_key"
                        fullWidth
                        label="Amazon S3 Secret key"
                        className="matchRuleAmazonS3SecretKey"
                        type="password"
                      />
                    </Grid>
                  </React.Fragment>
                )}
              </React.Fragment>
            )}
          </FormDataConsumer>
        </React.Fragment>

        <Grid item xs={2}>
          <BooleanInput
            source="match.response.allow"
            label="Allow Request"
            fullWidth
            defaultValue={false}
            className="matchResponseAllow"
          />
        </Grid>

        <Grid item xs={2}>
          <NumberInput
            source="match.response.code"
            label="Response Code"
            fullWidth
            defaultValue={403}
            className="matchResponseCode"
          />
        </Grid>
        <Grid item xs={6}>
          <FormDataConsumer>
            {({ formData, ...rest }) => (
              <React.Fragment>
                {formData?.match?.response?.code >= 301 &&
                  formData?.match?.response?.code <= 305 ? (
                  <TextInput
                    source="match.response.redirect_uri"
                    label="Proxy Pass/Redirect To"
                    fullWidth
                    validate={[required()]}
                    className="matchResponseRedirectUri"
                  />
                ) : (
                  <TextInput
                    source="match.response.redirect_uri"
                    label="Proxy Pass/Redirect To (Target)"
                    fullWidth
                    className="matchResponseRedirectUri"
                  />
                )}
              </React.Fragment>
            )}
          </FormDataConsumer>
        </Grid>

        <Grid item xs={2}>
          <BooleanInput
            source="match.response.is_consul"
            label="Is Consul"
            fullWidth
            defaultValue={false}
            className="matchResponseIsConsul"
          />
        </Grid>

        <Grid item xs={12}>
          <FormDataConsumer>
            {({ formData, ...rest }) => (
              <React.Fragment>
                {formData?.match?.response?.is_consul && (
                  <TextInput
                    source="match.response.consul_domain_name"
                    label="Consul Domain Name"
                    fullWidth
                    validate={[required()]}
                    className="matchResponseConsulDomainName"
                  />
                )}
              </React.Fragment>
            )}
          </FormDataConsumer>
        </Grid>

        <Grid item xs={12}>
          <TextInput
            multiline
            source="match.response.message"
            label="Response Message (Base64 Encoded)"
            fullWidth
            className="matchResponseMessage"
          />
        </Grid>
      </Grid>
    </SimpleForm>
  );
};

export default Form;
