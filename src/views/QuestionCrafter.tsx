import React, { useContext, useEffect, useRef, useState } from "react";
import { API_URL, HTTP_PREFIX } from "../helper/Constants";
import axios from "axios";
import withAuth from "../routes/withAuth";
import { useAuthUser } from "react-auth-kit";
import SideBarSmall from "../routes/SidebarSmall.tsx";
import handleGAEvent from "../utilities/handleGAEvent";
import { Button, Card, Col, Form, Row, Spinner } from "react-bootstrap";
import BidNavbar from "../routes/BidNavbar.tsx";
import "./QuestionsCrafter.css";
import { Editor, EditorState, convertToRaw, ContentState } from "draft-js";
import "draft-js/dist/Draft.css";
import { BidContext } from "./BidWritingStateManagerView.tsx";
import QuestionCrafterWizard from "../wizards/QuestionCrafterWizard.tsx";
import { useLocation, useNavigate } from "react-router-dom";
import { displayAlert } from "../helper/Alert.tsx";
import WordCountSelector from "../components/WordCountSelector.tsx";
import { debounce } from "lodash";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import StatusMenu, { Section } from "../components/StatusMenu.tsx";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faChevronRight,
  faTimes
} from "@fortawesome/free-solid-svg-icons";
import SectionTitle from "../components/SectionTitle.tsx";

const QuestionCrafter = () => {
  interface Subheading {
    subheading_id: string;
    title: string;
    extra_instructions: string;
    word_count: number;
  }

  const getAuth = useAuthUser();
  const auth = getAuth();
  const tokenRef = useRef(auth?.token || "default");

  const location = useLocation();
  const { section, bid_id, state_outline } = location.state;

  const [outline, setOutline] = useState<Section[]>(state_outline);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);

  const { sharedState, setSharedState, getBackgroundInfo } =
    useContext(BidContext);
  const { contributors } = sharedState;

  const backgroundInfo = getBackgroundInfo();

  const [inputText, setInputText] = useState(section.question || "");

  console.log("selectedfolders:", sharedState.selectedFolders);
  const [contentLoaded, setContentLoaded] = useState(true); // Set to true initially
  const [sectionAnswer, setSectionAnswer] = useState(null); // the answer generated for the subheadings
  const currentUserPermission = contributors[auth.email] || "viewer"; // Default to 'viewer' if not found
  const canUserEdit =
    currentUserPermission === "admin" || currentUserPermission === "editor";

  /////////////////////////////////////////////////////////////////////////////////////////////

  const [choice, setChoice] = useState("3");
  const [broadness, setBroadness] = useState("4");

  const [isLoading, setIsLoading] = useState(false);
  const [questionAsked, setQuestionAsked] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [selectedChoices, setSelectedChoices] = useState([]);
  const [apiChoices, setApiChoices] = useState([]);
  const [wordAmounts, setWordAmounts] = useState({});

  const [subheadings, setSubheadings] = useState<Subheading[]>([]);
  const [answerSections, setAnswerSections] = useState<AnswerSection[]>([]);
  const [sectionStatus, setSectionStatus] = useState(section.status);
  const [isLoadingSubheadings, setIsLoadingSubheadings] = useState(false);

  const [sectionWordCounts, setSectionWordCounts] = useState<
    Record<string, number>
  >({});

  const navigate = useNavigate();

  // Set initial section index from the passed section
  useEffect(() => {
    const index = outline.findIndex((s) => s.section_id === section.section_id);
    setCurrentSectionIndex(index !== -1 ? index : 0);
  }, [section.section_id, outline]);

  // Add navigation functions
  const navigateToSection = (section: Section) => {
    navigate("/question-crafter", {
      state: {
        section,
        bid_id: bid_id,
        state_outline: outline
      }
    });
  };

  const handlePreviousSection = () => {
    if (currentSectionIndex > 0) {
      navigateToSection(outline[currentSectionIndex - 1]);
    }
  };

  const handleNextSection = () => {
    if (currentSectionIndex < outline.length - 1) {
      navigateToSection(outline[currentSectionIndex + 1]);
    }
  };

  const showViewOnlyMessage = () => {
    console.log(currentUserPermission);
    displayAlert("You only have permission to view this bid.", "danger");
  };

  // Add this utility function to convert EditorState to plain text
  const getPlainTextFromEditorState = (editorState) => {
    const contentState = editorState.getCurrentContent();
    const rawContent = convertToRaw(contentState);
    return rawContent.blocks.map((block) => block.text).join("\n");
  };

  const updateStatus = async (status: String) => {
    try {
      await axios.post(
        `http${HTTP_PREFIX}://${API_URL}/update_status`,
        {
          bid_id: sharedState.object_id,
          section_id: section.section_id,
          status: status
        },
        {
          headers: {
            Authorization: `Bearer ${tokenRef.current}`,
            "Content-Type": "application/json"
          }
        }
      );

      // Update the local state after successful API call
      setSectionStatus(status);
    } catch (err) {
      console.error("Error updating section:", err);
      // Revert to previous status if update fails
      setSectionStatus(section.status);
      displayAlert("Failed to update status", "danger");
    }
  };

  // Add useEffect to initialize status from section prop
  useEffect(() => {
    setSectionStatus(section.status);
  }, [section.status]);

  const deleteSubheading = async (
    bid_id: string,
    section_id: string,
    subheading_id: string
  ) => {
    try {
      console.log(bid_id);
      console.log(section_id);
      console.log(subheading_id);
      await axios.post(
        `http${HTTP_PREFIX}://${API_URL}/delete_subheading`,
        {
          bid_id,
          section_id,
          subheading_id
        },
        {
          headers: {
            Authorization: `Bearer ${tokenRef.current}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log("Successfully deleted subheading:", subheading_id);
      updateStatus("In Progress");
      fetchSubheadings();
      // Fetch updated subheadings after successful update
    } catch (error) {
      console.error("Error updating subheading:", error);
    }
  };

  // Add this function to handle the API call
  const updateSubheading = async (
    bid_id: string,
    section_id: string,
    subheading_id: string,
    extra_instructions: string,
    word_count: number
  ) => {
    try {
      console.log("updating subheadings");
      await axios.post(
        `http${HTTP_PREFIX}://${API_URL}/update_subheading`,
        {
          bid_id,
          section_id,
          subheading_id,
          extra_instructions,
          word_count
        },
        {
          headers: {
            Authorization: `Bearer ${tokenRef.current}`,
            "Content-Type": "application/json"
          }
        }
      );
      console.log("Successfully updated subheading:", subheading_id);
      updateStatus("In Progress");
      // Fetch updated subheadings after successful update
    } catch (error) {
      console.error("Error updating subheading:", error);
    }
  };

  // Create a debounced version of the update function
  const debouncedUpdateSubheading = debounce((...args) => {
    updateSubheading(...args).catch((error) => {
      console.error("Error in debounced update:", error);
    });
  }, 1000);

  const handleWordCountChange = (subheadingId: string, newCount: number) => {
    setSectionWordCounts((prev) => ({
      ...prev,
      [subheadingId]: newCount
    }));

    // Find the current extra instructions for this subheading
    const currentSection = answerSections.find(
      (section) => section.subheading_id === subheadingId
    );

    if (currentSection) {
      const extraInstructions = getPlainTextFromEditorState(
        currentSection.editorState
      );

      debouncedUpdateSubheading(
        bid_id,
        section.section_id,
        subheadingId,
        extraInstructions,
        newCount
      );
    }
  };

  // Update the handleAnswerChange function
  const handleAnswerChange = (
    editorState: EditorState,
    subheadingId: string
  ) => {
    console.log(
      `Updating editor state for section ${subheadingId}`,
      editorState
    );

    setAnswerSections((prev) => {
      const updatedSections = prev.map((section) => {
        if (section.subheading_id === subheadingId) {
          console.log(
            `Found matching section, updating content for ${section.title}`
          );
          return {
            ...section,
            editorState
          };
        }
        return section;
      });
      return updatedSections;
    });

    // Get the plain text content from the editor state
    const extraInstructions = getPlainTextFromEditorState(editorState);

    // Get the current word count for this subheading
    const wordCount = sectionWordCounts[subheadingId] || 100;

    // Call the debounced update function
    debouncedUpdateSubheading(
      tokenRef,
      bid_id,
      section.section_id,
      subheadingId,
      extraInstructions,
      wordCount
    );
  };

  // Update the fetchSubheadings function to handle references after setting state
  const fetchSubheadings = async () => {
    console.log("fetching subheadings");
    setIsLoadingSubheadings(true);
    try {
      const response = await axios.post(
        `http${HTTP_PREFIX}://${API_URL}/get_subheadings`,
        {
          bid_id: bid_id,
          section_id: section.section_id
        },
        {
          headers: {
            Authorization: `Bearer ${tokenRef.current}`,
            "Content-Type": "application/json"
          }
        }
      );

      // Validate that response.data.subheadings exists and is an array
      const subheadingsData = response.data.subheadings || [];

      // Filter out any null values and validate subheading objects
      const validSubheadings = subheadingsData.filter(
        (sh) => sh && typeof sh === "object" && sh.subheading_id && sh.title
      );

      setSubheadings(validSubheadings);

      // Initialize answer sections only for valid subheadings
      const newAnswerSections = validSubheadings.map((sh) => {
        // Set default word count if not provided
        setSectionWordCounts((prev) => ({
          ...prev,
          [sh.subheading_id]: sh.word_count || 100
        }));

        // Create editor state with existing instructions or empty string
        const initialState = EditorState.createWithContent(
          ContentState.createFromText(sh.extra_instructions || "")
        );

        return {
          subheading_id: sh.subheading_id,
          title: sh.title,
          editorState: initialState
        };
      });

      console.log(
        "Setting new answer sections with updated content:",
        newAnswerSections
      );
      setAnswerSections(newAnswerSections);
    } catch (error) {
      console.error("Error fetching subheadings:", error);
      // Set empty arrays as fallback
      setSubheadings([]);
      setAnswerSections([]);
      displayAlert("Failed to fetch subheadings", "danger");
    } finally {
      setIsLoadingSubheadings(false);
    }
  };
  // Fetch subheadings when component mounts or when section changes
  useEffect(() => {
    if (section?.section_id) {
      fetchSubheadings();
    }
  }, [section]);

  useEffect(() => {
    let timer;
    if (isLoading && startTime) {
      timer = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        setElapsedTime(elapsed);
      }, 100); // Update every 100ms
    }
    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isLoading, startTime]);

  const sendQuestionToChatbot = async () => {
    handleGAEvent("Chatbot", "Submit Question", "Submit Button");
    setQuestionAsked(true);
    localStorage.setItem("questionAsked", "true");
    setIsLoading(true);
    setStartTime(Date.now());
    setElapsedTime(0);

    console.log("Starting question request with:", {
      inputText,
      backgroundInfo
    });

    try {
      const result = await axios.post(
        `http${HTTP_PREFIX}://${API_URL}/question`,
        {
          choice: choice === "3" ? "3a" : choice,
          broadness: broadness,
          input_text: inputText,
          extra_instructions: backgroundInfo,
          datasets: sharedState.selectedFolders,
          bid_id: sharedState.object_id
        },
        {
          headers: {
            Authorization: `Bearer ${tokenRef.current}`
          }
        }
      );

      console.log("Received response:", result.data);

      let choicesArray = [];

      try {
        // First, try splitting by semicolons
        if (result.data && result.data.includes(";")) {
          choicesArray = result.data.split(";").map((choice) => choice.trim());
        }

        // If semicolon splitting didn't work, try parsing as a numbered list
        if (choicesArray.length === 0 && typeof result.data === "string") {
          choicesArray = result.data
            .split("\n")
            .filter((line) => /^\d+\./.test(line.trim()))
            .map((line) => line.replace(/^\d+\.\s*/, "").trim());
        }

        console.log("Parsed choices:", choicesArray);

        if (choicesArray.length === 0) {
          throw new Error("Failed to parse API response into choices");
        }
      } catch (error) {
        console.error("Error processing API response:", error);
      }

      setApiChoices(choicesArray);
    } catch (error) {
      console.error("Error sending question:", error);
    } finally {
      setIsLoading(false);
      setStartTime(null); // Reset start time when done
    }
  };

  const handleChoiceSelection = (selectedChoice) => {
    if (selectedChoices.includes(selectedChoice)) {
      setSelectedChoices(
        selectedChoices.filter((choice) => choice !== selectedChoice)
      );
      setWordAmounts((prevWordAmounts) => {
        const newWordAmounts = { ...prevWordAmounts };
        delete newWordAmounts[selectedChoice];
        return newWordAmounts;
      });
    } else {
      setSelectedChoices([...selectedChoices, selectedChoice]);
      setWordAmounts((prevWordAmounts) => ({
        ...prevWordAmounts,
        [selectedChoice]: 100 // Default word amount
      }));
    }
    updateStatus("In Progress");
  };

  const renderChoices = () => {
    return (
      <div className="choices-container">
        {apiChoices
          .filter((choice) => choice && choice.trim() !== "") // Filter out empty or whitespace-only choices
          .map((choice, index) => (
            <div key={index} className="choice-item d-flex align-items-center">
              <Form.Check
                type="checkbox"
                checked={selectedChoices.includes(choice)}
                onChange={() => handleChoiceSelection(choice)}
              />
              {selectedChoices.includes(choice) ? (
                <Form.Control
                  type="text"
                  value={choice}
                  onChange={(e) => handleChoiceEdit(index, e.target.value)}
                  className="ml-2 editable-choice"
                  style={{ width: "70%", marginLeft: "10px" }}
                />
              ) : (
                <span
                  onClick={() => handleChoiceSelection(choice)}
                  style={{ cursor: "pointer" }}
                >
                  {choice}
                </span>
              )}
            </div>
          ))}
      </div>
    );
  };

  const handleChoiceEdit = (index, newValue) => {
    const updatedChoices = [...apiChoices];
    updatedChoices[index] = newValue;
    setApiChoices(updatedChoices);

    // Update selectedChoices and wordAmounts if the edited choice was selected
    if (selectedChoices.includes(apiChoices[index])) {
      const updatedSelectedChoices = selectedChoices.map((choice) =>
        choice === apiChoices[index] ? newValue : choice
      );
      setSelectedChoices(updatedSelectedChoices);

      const updatedWordAmounts = { ...wordAmounts };
      if (updatedWordAmounts[apiChoices[index]]) {
        updatedWordAmounts[newValue] = updatedWordAmounts[apiChoices[index]];
        delete updatedWordAmounts[apiChoices[index]];
      }
      setWordAmounts(updatedWordAmounts);
    }
  };

  const submitSelections = async () => {
    setIsLoading(true);
    setStartTime(Date.now());
    setElapsedTime(0);
    try {
      console.log("Starting submitSelections with choices:", selectedChoices);

      const word_amounts = selectedChoices.map((choice) =>
        String(wordAmounts[choice] || "100")
      );

      const result = await axios.post(
        `http${HTTP_PREFIX}://${API_URL}/add_section_subheadings`,
        {
          selected_choices: selectedChoices,
          bid_id: sharedState.object_id,
          section_id: section.section_id // Add section_id to the request
        },
        {
          headers: {
            Authorization: `Bearer ${tokenRef.current}`
          }
        }
      );

      console.log("Received response from question_multistep:", result.data);

      if (result.data.section) {
        // Update answer sections from the response
        const newAnswerSections = result.data.section.subheadings.map((sh) => {
          const initialState = EditorState.createWithContent(
            ContentState.createFromText(sh.extra_instructions || "")
          );
          // Make references bold immediately when creating new sections
          return {
            subheading_id: sh.subheading_id,
            title: sh.title,
            editorState: initialState
          };
        });

        console.log("Setting new answer sections after submission");
        setAnswerSections(newAnswerSections);
      }

      setApiChoices([]);
      setSelectedChoices([]);
      setWordAmounts({});
    } catch (error) {
      console.error("Error submitting selections:", error);
      displayAlert("Error generating responses", "danger");
    } finally {
      setIsLoading(false);
      setStartTime(null);
    }
  };

  const reorder = (list, startIndex, endIndex) => {
    const result = Array.from(list);
    const [removed] = result.splice(startIndex, 1);
    result.splice(endIndex, 0, removed);
    return result;
  };

  // Add this handler to your component
  const onDragEnd = (result) => {
    // dropped outside the list
    if (!result.destination) {
      return;
    }

    const reorderedSections = reorder(
      answerSections,
      result.source.index,
      result.destination.index
    );

    setAnswerSections(reorderedSections);
  };

  const renderAnswerSections = () => {
    if (isLoadingSubheadings) {
      return <div></div>;
    }

    return (
      <div style={{ marginLeft: "40px" }}>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="droppable">
            {(provided, snapshot) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="droppable-container" // Add this class here
                style={{
                  minHeight: "100px"
                }}
              >
                {answerSections.map((answerSection, index) => (
                  <Draggable
                    key={answerSection.subheading_id}
                    draggableId={answerSection.subheading_id}
                    index={index}
                  >
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`draggable-section ${snapshot.isDragging ? "dragging" : ""}`}
                        style={{
                          ...provided.draggableProps.style,
                          transform: provided.draggableProps.style?.transform,
                          transformOrigin: "0 0",
                          width: "100%" // Ensure consistent width
                        }}
                      >
                        <div
                          {...provided.dragHandleProps}
                          className="drag-handle"
                          style={{
                            // Prevent the drag handle from jumping
                            touchAction: "none",
                            userSelect: "none"
                          }}
                        >
                          <DragIndicatorIcon
                            style={{
                              fontSize: "35px",
                              color: "#6c757d",
                              display: "block",
                              pointerEvents: "none",
                              touchAction: "none"
                            }}
                          />
                        </div>

                        <Card className="section-card mb-4">
                          <div className="section-header">
                            <button
                              onClick={() =>
                                deleteSubheading(
                                  sharedState.object_id,
                                  section.section_id,
                                  answerSection.subheading_id
                                )
                              }
                              className="p-2 delete-cross"
                            >
                              <FontAwesomeIcon
                                icon={faTimes}
                                className="w-5 h-5 "
                              />
                            </button>
                            <h3
                              className="section-title"
                              title={answerSection.title}
                            >
                              {answerSection.title}
                            </h3>
                            <div>
                              <WordCountSelector
                                subheadingId={answerSection.subheading_id}
                                initialCount={
                                  sectionWordCounts[
                                    answerSection.subheading_id
                                  ] || 100
                                }
                                onChange={handleWordCountChange}
                                disabled={!canUserEdit}
                              />
                            </div>
                            <div></div>
                          </div>

                          <div className="editor-container">
                            <Editor
                              editorState={answerSection.editorState}
                              onChange={(newState) =>
                                handleAnswerChange(
                                  newState,
                                  answerSection.subheading_id
                                )
                              }
                              customStyleMap={{
                                BOLD: { fontWeight: "bold" }
                              }}
                              readOnly={!canUserEdit}
                              placeholder="Add extra information here about what you want to write about..."
                            />
                          </div>
                        </Card>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    );
  };
  // Force a re-render after updating the sections
  useEffect(() => {
    if (contentLoaded) {
      console.log("Content loaded, current answer sections:", answerSections);
      const timeoutId = setTimeout(() => {
        setAnswerSections((prev) => [...prev]);
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, [contentLoaded]);

  return (
    <div className="chatpage">
      <SideBarSmall />

      <div className="lib-container">
        <div className="scroll-container">
          <BidNavbar />

          <div>
            <Row
              className="justify-content-md-center"
              style={{ visibility: "hidden", height: 0, overflow: "hidden" }}
            ></Row>

            <Col md={12}>
              <div className="proposal-header mt-3 mb-3">
                <SectionTitle
                  canUserEdit={canUserEdit}
                  displayAlert={displayAlert}
                  showViewOnlyMessage={showViewOnlyMessage}
                  sectiontitle={section.heading}
                  section={section}
                  sectionIndex={currentSectionIndex}
                  bid_id={bid_id}
                  tokenRef={tokenRef}
                />
                <StatusMenu
                  value={sectionStatus} // Use the local state instead of section.status
                  onChange={(value) => updateStatus(value)}
                />
              </div>
              <div className="d-flex align-items-center mb-2">
                <h1 className="lib-title me-2" id="question-section">
                  Question
                </h1>
                <div className="d-flex justify-content-between align-items-center gap-1 mb-2">
                  <button
                    onClick={handlePreviousSection}
                    disabled={currentSectionIndex === 0}
                    className="navigation-button"
                  >
                    <FontAwesomeIcon icon={faChevronLeft} />
                  </button>
                  <div className="text-muted">
                    Section {currentSectionIndex + 1} of {outline.length}
                  </div>
                  <button
                    onClick={handleNextSection}
                    disabled={currentSectionIndex === outline.length - 1}
                    className="navigation-button"
                  >
                    <FontAwesomeIcon icon={faChevronRight} />
                  </button>
                </div>
              </div>

              <div className="question-answer-box">
                <textarea
                  className="card-textarea"
                  placeholder="Enter question here..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  disabled={!canUserEdit}
                ></textarea>
              </div>
              <div className="text-muted mt-2">
                Word Count: {inputText.split(/\s+/).filter(Boolean).length}
              </div>
              <Button
                className="upload-button mt-2"
                onClick={sendQuestionToChatbot}
                disabled={inputText.trim() === ""}
              >
                Add Subsections
              </Button>

              <Row>
                <div className="" style={{ textAlign: "left" }}>
                  {isLoading && (
                    <div className="my-3">
                      <Spinner animation="border" />
                      <div>Elapsed Time: {elapsedTime.toFixed(1)}s</div>
                    </div>
                  )}
                  {choice === "3" && apiChoices.length > 0 && (
                    <div>
                      {renderChoices()}
                      <Button
                        variant="primary"
                        onClick={submitSelections}
                        className="upload-button mt-3"
                        disabled={selectedChoices.length === 0}
                      >
                        Generate answers for selected subsections
                      </Button>
                    </div>
                  )}
                </div>
              </Row>
            </Col>

            {isLoadingSubheadings ? (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}
              >
                <Spinner></Spinner>
              </div>
            ) : (
              <>
                {answerSections.length > 0 ? (
                  <div className="proposal-header mb-2">
                    <h2 className="heavy mt-4 text-center">Subsections</h2>
                  </div>
                ) : (
                  <div></div>
                )}
              </>
            )}
            {renderAnswerSections()}
            <p>{sectionAnswer}</p>
          </div>
        </div>
      </div>
      {/* <QuestionCrafterWizard /> */}
    </div>
  );
};

export default withAuth(QuestionCrafter);
