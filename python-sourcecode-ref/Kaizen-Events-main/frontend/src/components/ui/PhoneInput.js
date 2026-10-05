import React, { useState, useEffect } from 'react';
import { Input } from './input';

const COUNTRIES = [
  // India first
  { code: 'IN', dial: '+91',  name: 'India' },
  // All countries A-Z
  { code: 'AF', dial: '+93',  name: 'Afghanistan' },
  { code: 'AL', dial: '+355', name: 'Albania' },
  { code: 'DZ', dial: '+213', name: 'Algeria' },
  { code: 'AD', dial: '+376', name: 'Andorra' },
  { code: 'AO', dial: '+244', name: 'Angola' },
  { code: 'AG', dial: '+1',   name: 'Antigua & Barbuda' },
  { code: 'AR', dial: '+54',  name: 'Argentina' },
  { code: 'AM', dial: '+374', name: 'Armenia' },
  { code: 'AU', dial: '+61',  name: 'Australia' },
  { code: 'AT', dial: '+43',  name: 'Austria' },
  { code: 'AZ', dial: '+994', name: 'Azerbaijan' },
  { code: 'BS', dial: '+1',   name: 'Bahamas' },
  { code: 'BH', dial: '+973', name: 'Bahrain' },
  { code: 'BD', dial: '+880', name: 'Bangladesh' },
  { code: 'BB', dial: '+1',   name: 'Barbados' },
  { code: 'BY', dial: '+375', name: 'Belarus' },
  { code: 'BE', dial: '+32',  name: 'Belgium' },
  { code: 'BZ', dial: '+501', name: 'Belize' },
  { code: 'BJ', dial: '+229', name: 'Benin' },
  { code: 'BT', dial: '+975', name: 'Bhutan' },
  { code: 'BO', dial: '+591', name: 'Bolivia' },
  { code: 'BA', dial: '+387', name: 'Bosnia & Herzegovina' },
  { code: 'BW', dial: '+267', name: 'Botswana' },
  { code: 'BR', dial: '+55',  name: 'Brazil' },
  { code: 'BN', dial: '+673', name: 'Brunei' },
  { code: 'BG', dial: '+359', name: 'Bulgaria' },
  { code: 'BF', dial: '+226', name: 'Burkina Faso' },
  { code: 'BI', dial: '+257', name: 'Burundi' },
  { code: 'KH', dial: '+855', name: 'Cambodia' },
  { code: 'CM', dial: '+237', name: 'Cameroon' },
  { code: 'CA', dial: '+1',   name: 'Canada' },
  { code: 'CV', dial: '+238', name: 'Cape Verde' },
  { code: 'CF', dial: '+236', name: 'Central African Republic' },
  { code: 'TD', dial: '+235', name: 'Chad' },
  { code: 'CL', dial: '+56',  name: 'Chile' },
  { code: 'CN', dial: '+86',  name: 'China' },
  { code: 'CO', dial: '+57',  name: 'Colombia' },
  { code: 'KM', dial: '+269', name: 'Comoros' },
  { code: 'CD', dial: '+243', name: 'Congo (DRC)' },
  { code: 'CG', dial: '+242', name: 'Congo (Republic)' },
  { code: 'CR', dial: '+506', name: 'Costa Rica' },
  { code: 'HR', dial: '+385', name: 'Croatia' },
  { code: 'CU', dial: '+53',  name: 'Cuba' },
  { code: 'CY', dial: '+357', name: 'Cyprus' },
  { code: 'CZ', dial: '+420', name: 'Czech Republic' },
  { code: 'DK', dial: '+45',  name: 'Denmark' },
  { code: 'DJ', dial: '+253', name: 'Djibouti' },
  { code: 'DO', dial: '+1',   name: 'Dominican Republic' },
  { code: 'EC', dial: '+593', name: 'Ecuador' },
  { code: 'EG', dial: '+20',  name: 'Egypt' },
  { code: 'SV', dial: '+503', name: 'El Salvador' },
  { code: 'GQ', dial: '+240', name: 'Equatorial Guinea' },
  { code: 'ER', dial: '+291', name: 'Eritrea' },
  { code: 'EE', dial: '+372', name: 'Estonia' },
  { code: 'SZ', dial: '+268', name: 'Eswatini' },
  { code: 'ET', dial: '+251', name: 'Ethiopia' },
  { code: 'FJ', dial: '+679', name: 'Fiji' },
  { code: 'FI', dial: '+358', name: 'Finland' },
  { code: 'FR', dial: '+33',  name: 'France' },
  { code: 'GA', dial: '+241', name: 'Gabon' },
  { code: 'GM', dial: '+220', name: 'Gambia' },
  { code: 'GE', dial: '+995', name: 'Georgia' },
  { code: 'DE', dial: '+49',  name: 'Germany' },
  { code: 'GH', dial: '+233', name: 'Ghana' },
  { code: 'GR', dial: '+30',  name: 'Greece' },
  { code: 'GD', dial: '+1',   name: 'Grenada' },
  { code: 'GT', dial: '+502', name: 'Guatemala' },
  { code: 'GN', dial: '+224', name: 'Guinea' },
  { code: 'GY', dial: '+592', name: 'Guyana' },
  { code: 'HT', dial: '+509', name: 'Haiti' },
  { code: 'HN', dial: '+504', name: 'Honduras' },
  { code: 'HK', dial: '+852', name: 'Hong Kong' },
  { code: 'HU', dial: '+36',  name: 'Hungary' },
  { code: 'IS', dial: '+354', name: 'Iceland' },
  { code: 'ID', dial: '+62',  name: 'Indonesia' },
  { code: 'IR', dial: '+98',  name: 'Iran' },
  { code: 'IQ', dial: '+964', name: 'Iraq' },
  { code: 'IE', dial: '+353', name: 'Ireland' },
  { code: 'IL', dial: '+972', name: 'Israel' },
  { code: 'IT', dial: '+39',  name: 'Italy' },
  { code: 'CI', dial: '+225', name: 'Ivory Coast' },
  { code: 'JM', dial: '+1',   name: 'Jamaica' },
  { code: 'JP', dial: '+81',  name: 'Japan' },
  { code: 'JO', dial: '+962', name: 'Jordan' },
  { code: 'KZ', dial: '+7',   name: 'Kazakhstan' },
  { code: 'KE', dial: '+254', name: 'Kenya' },
  { code: 'KW', dial: '+965', name: 'Kuwait' },
  { code: 'KG', dial: '+996', name: 'Kyrgyzstan' },
  { code: 'LA', dial: '+856', name: 'Laos' },
  { code: 'LV', dial: '+371', name: 'Latvia' },
  { code: 'LB', dial: '+961', name: 'Lebanon' },
  { code: 'LS', dial: '+266', name: 'Lesotho' },
  { code: 'LR', dial: '+231', name: 'Liberia' },
  { code: 'LY', dial: '+218', name: 'Libya' },
  { code: 'LI', dial: '+423', name: 'Liechtenstein' },
  { code: 'LT', dial: '+370', name: 'Lithuania' },
  { code: 'LU', dial: '+352', name: 'Luxembourg' },
  { code: 'MO', dial: '+853', name: 'Macau' },
  { code: 'MG', dial: '+261', name: 'Madagascar' },
  { code: 'MW', dial: '+265', name: 'Malawi' },
  { code: 'MY', dial: '+60',  name: 'Malaysia' },
  { code: 'MV', dial: '+960', name: 'Maldives' },
  { code: 'ML', dial: '+223', name: 'Mali' },
  { code: 'MT', dial: '+356', name: 'Malta' },
  { code: 'MR', dial: '+222', name: 'Mauritania' },
  { code: 'MU', dial: '+230', name: 'Mauritius' },
  { code: 'MX', dial: '+52',  name: 'Mexico' },
  { code: 'MD', dial: '+373', name: 'Moldova' },
  { code: 'MC', dial: '+377', name: 'Monaco' },
  { code: 'MN', dial: '+976', name: 'Mongolia' },
  { code: 'ME', dial: '+382', name: 'Montenegro' },
  { code: 'MA', dial: '+212', name: 'Morocco' },
  { code: 'MZ', dial: '+258', name: 'Mozambique' },
  { code: 'MM', dial: '+95',  name: 'Myanmar' },
  { code: 'NA', dial: '+264', name: 'Namibia' },
  { code: 'NP', dial: '+977', name: 'Nepal' },
  { code: 'NL', dial: '+31',  name: 'Netherlands' },
  { code: 'NZ', dial: '+64',  name: 'New Zealand' },
  { code: 'NI', dial: '+505', name: 'Nicaragua' },
  { code: 'NE', dial: '+227', name: 'Niger' },
  { code: 'NG', dial: '+234', name: 'Nigeria' },
  { code: 'MK', dial: '+389', name: 'North Macedonia' },
  { code: 'NO', dial: '+47',  name: 'Norway' },
  { code: 'OM', dial: '+968', name: 'Oman' },
  { code: 'PK', dial: '+92',  name: 'Pakistan' },
  { code: 'PS', dial: '+970', name: 'Palestine' },
  { code: 'PA', dial: '+507', name: 'Panama' },
  { code: 'PG', dial: '+675', name: 'Papua New Guinea' },
  { code: 'PY', dial: '+595', name: 'Paraguay' },
  { code: 'PE', dial: '+51',  name: 'Peru' },
  { code: 'PH', dial: '+63',  name: 'Philippines' },
  { code: 'PL', dial: '+48',  name: 'Poland' },
  { code: 'PT', dial: '+351', name: 'Portugal' },
  { code: 'PR', dial: '+1',   name: 'Puerto Rico' },
  { code: 'QA', dial: '+974', name: 'Qatar' },
  { code: 'RO', dial: '+40',  name: 'Romania' },
  { code: 'RU', dial: '+7',   name: 'Russia' },
  { code: 'RW', dial: '+250', name: 'Rwanda' },
  { code: 'SA', dial: '+966', name: 'Saudi Arabia' },
  { code: 'SN', dial: '+221', name: 'Senegal' },
  { code: 'RS', dial: '+381', name: 'Serbia' },
  { code: 'SC', dial: '+248', name: 'Seychelles' },
  { code: 'SL', dial: '+232', name: 'Sierra Leone' },
  { code: 'SG', dial: '+65',  name: 'Singapore' },
  { code: 'SK', dial: '+421', name: 'Slovakia' },
  { code: 'SI', dial: '+386', name: 'Slovenia' },
  { code: 'SO', dial: '+252', name: 'Somalia' },
  { code: 'ZA', dial: '+27',  name: 'South Africa' },
  { code: 'KR', dial: '+82',  name: 'South Korea' },
  { code: 'SS', dial: '+211', name: 'South Sudan' },
  { code: 'ES', dial: '+34',  name: 'Spain' },
  { code: 'LK', dial: '+94',  name: 'Sri Lanka' },
  { code: 'SD', dial: '+249', name: 'Sudan' },
  { code: 'SR', dial: '+597', name: 'Suriname' },
  { code: 'SE', dial: '+46',  name: 'Sweden' },
  { code: 'CH', dial: '+41',  name: 'Switzerland' },
  { code: 'SY', dial: '+963', name: 'Syria' },
  { code: 'TW', dial: '+886', name: 'Taiwan' },
  { code: 'TJ', dial: '+992', name: 'Tajikistan' },
  { code: 'TZ', dial: '+255', name: 'Tanzania' },
  { code: 'TH', dial: '+66',  name: 'Thailand' },
  { code: 'TL', dial: '+670', name: 'Timor-Leste' },
  { code: 'TG', dial: '+228', name: 'Togo' },
  { code: 'TT', dial: '+1',   name: 'Trinidad & Tobago' },
  { code: 'TN', dial: '+216', name: 'Tunisia' },
  { code: 'TR', dial: '+90',  name: 'Turkey' },
  { code: 'TM', dial: '+993', name: 'Turkmenistan' },
  { code: 'UG', dial: '+256', name: 'Uganda' },
  { code: 'UA', dial: '+380', name: 'Ukraine' },
  { code: 'AE', dial: '+971', name: 'UAE' },
  { code: 'GB', dial: '+44',  name: 'United Kingdom' },
  { code: 'US', dial: '+1',   name: 'United States' },
  { code: 'UY', dial: '+598', name: 'Uruguay' },
  { code: 'UZ', dial: '+998', name: 'Uzbekistan' },
  { code: 'VE', dial: '+58',  name: 'Venezuela' },
  { code: 'VN', dial: '+84',  name: 'Vietnam' },
  { code: 'YE', dial: '+967', name: 'Yemen' },
  { code: 'ZM', dial: '+260', name: 'Zambia' },
  { code: 'ZW', dial: '+263', name: 'Zimbabwe' },
];

/**
 * PhoneInput — country code selector + phone number input.
 *
 * Props:
 *  value       – phone digits (without country code)
 *  onChange     – (digits: string) => void
 *  countryCode – selected country ISO code (default 'IN')
 *  onCountryChange – (countryCode: string) => void  (optional)
 *  placeholder – input placeholder
 *  required    – HTML required
 *  disabled    – HTML disabled / readOnly
 *  className   – extra classes on the wrapper div
 *  inputClassName – extra classes on the input element
 */
const PhoneInput = ({
  value = '',
  onChange,
  countryCode = 'IN',
  onCountryChange,
  placeholder,
  required,
  disabled,
  className = '',
  inputClassName = '',
  selectClassName = '',
  // Restrict the country dropdown to this subset of ISO codes.
  // undefined / empty → all countries allowed.
  // Exactly 1 entry → dropdown collapses to a locked pill.
  allowedCountries,
}) => {
  // Compute the effective list of countries to show
  const visibleCountries =
    Array.isArray(allowedCountries) && allowedCountries.length > 0
      ? COUNTRIES.filter(c => allowedCountries.includes(c.code))
      : COUNTRIES;

  // Ensure the selected code is actually in the allowed list; fall back to first allowed
  const effectiveInitial = visibleCountries.find(c => c.code === countryCode)
    ? countryCode
    : visibleCountries[0]?.code || 'IN';

  const [selectedCode, setSelectedCode] = useState(effectiveInitial);

  // When parent changes countryCode (e.g., admin switched default), follow it if allowed
  useEffect(() => {
    if (!countryCode) return;
    const isAllowed = visibleCountries.some(c => c.code === countryCode);
    if (isAllowed && countryCode !== selectedCode) {
      setSelectedCode(countryCode);
    } else if (!isAllowed && visibleCountries.length > 0 && !visibleCountries.some(c => c.code === selectedCode)) {
      setSelectedCode(visibleCountries[0].code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode, allowedCountries]);

  const country = visibleCountries.find(c => c.code === selectedCode) || visibleCountries[0] || COUNTRIES[0];
  const isLocked = visibleCountries.length === 1;

  const handleCountryChange = (e) => {
    const newCode = e.target.value;
    setSelectedCode(newCode);
    onCountryChange?.(newCode);
    onChange?.('');
  };

  const maxDigits = country.code === 'IN' ? 10 : 15;

  const handlePhoneChange = (e) => {
    const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, maxDigits);
    onChange?.(digits);
  };

  const isInvalid = country.code === 'IN'
    ? (value.length > 0 && value.length !== 10)
    : (value.length > 0 && value.length < 7);

  return (
    <div className={`flex gap-2 ${className}`}>
      {isLocked ? (
        <div className={`h-12 px-3 flex items-center text-base sm:text-sm border border-slate-300 rounded-lg bg-slate-50 text-slate-700 font-jakarta w-[110px] sm:w-[130px] flex-shrink-0 ${selectClassName}`}>
          <span className="mr-1">{country.dial}</span>
          <span className="text-xs text-slate-400">({country.code})</span>
        </div>
      ) : (
        /* Fixed width + flex-shrink-0: native <select> would otherwise grow to
           fit its WIDEST option (e.g. long country names) and starve the phone
           input next to it on narrow screens. */
        <div className="relative flex-shrink-0">
          <select
            value={selectedCode}
            onChange={handleCountryChange}
            disabled={disabled}
            className={`appearance-none h-12 w-[110px] sm:w-[130px] pl-3 pr-8 text-base sm:text-sm border border-slate-300 rounded-lg bg-white font-jakarta focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer truncate hover:border-slate-400 transition-colors ${selectClassName}`}
          >
            {visibleCountries.map(c => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.dial})
              </option>
            ))}
          </select>
          {/* Custom chevron — replaces the dated native dropdown arrow */}
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      )}
      <Input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        pattern="[0-9]*"
        maxLength={maxDigits}
        value={value}
        onChange={handlePhoneChange}
        placeholder={placeholder || 'Enter mobile number'}
        required={required}
        readOnly={disabled}
        className={`flex-1 min-w-0 h-12 rounded-lg border-slate-300 font-jakarta text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary ${isInvalid ? 'border-red-400' : ''} ${inputClassName}`}
      />
    </div>
  );
};

/**
 * Validate phone number for any country.
 * @param {string} phone – digits only
 * @param {string} countryCode – ISO code (default 'IN')
 * @returns {boolean}
 */
export const validatePhone = (phone, countryCode = 'IN') => {
  const digits = (phone || '').replace(/\D/g, '');
  if (countryCode === 'IN') return digits.length === 10;
  return digits.length >= 7 && digits.length <= 15;
};

export { COUNTRIES };
export default PhoneInput;
