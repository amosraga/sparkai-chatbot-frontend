import React, { useRef, useState, useEffect } from "react";
import "./CustomDateInput.css";

const CustomDateInput = ({ value, onChange, disabled }) => {
  const dateInputRef = useRef(null);
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    if (value) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        setDisplayValue(formatDate(date));
      }
    }
  }, [value]);

  const formatDate = (date) => {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleIconClick = (e) => {
    e.preventDefault();
    dateInputRef.current.showPicker();
  };

  const handleDateChange = (e) => {
    const newValue = e.target.value;
    const date = new Date(newValue);
    if (!isNaN(date.getTime())) {
      setDisplayValue(formatDate(date));
      onChange(newValue);
    }
  };

  return (
    <div className="custom-date-input">
      <input
        type="text"
        value={displayValue}
        readOnly
        disabled={disabled}
        className="form-control date-input date-textarea"
        onClick={handleIconClick}
      />
      <input
        ref={dateInputRef}
        type="date"
        value={value || ""}
        onChange={handleDateChange}
        disabled={disabled}
        className="hidden-date-input"
      />
      <i
        className="fas fa-calendar-alt calendar-icon"
        onClick={handleIconClick}
      ></i>
    </div>
  );
};

export default CustomDateInput;
