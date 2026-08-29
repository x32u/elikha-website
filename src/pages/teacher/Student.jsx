import React, { useEffect, useMemo, useState } from 'react';
import Navbar from '../../components/Navbar';
import './Student.css';
import { getTeacherStudents, getStudentSubmissions, getStudentArtworks } from '../../services/teacherApi';
import { hasStarRating, starRatingText } from '../../utils/starRating';
import ExcelJS from 'exceljs';
import { serializeCsvRow } from '../../utils/reportAnalytics';

const Student = () => {
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('submitted');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('all');
  const [selectedSection, setSelectedSection] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [allStudents, setAllStudents] = useState([]);
  const [studentSubmissions, setStudentSubmissions] = useState([]);
  const [studentArtworks, setStudentArtworks] = useState([]);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const formatDate = (value, fallback = 'No due date') => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString();
  };

  useEffect(() => {
    loadStudents();
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      loadStudentDetails(selectedStudent.id);
    }
  }, [selectedStudent]);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo') || '{}');
      console.log('Loading students for teacher:', userInfo.id);
      const result = await getTeacherStudents(userInfo.id);
      
      console.log('Students API result:', result);
      
      if (result.success) {
        // Transform student data
        const transformedStudents = result.data.map(student => {
          console.log('Processing student:', student);
          // Get class info from the classes array if available
          const classInfo = student.classes?.[0] || {};
          
          return {
            id: student.id,
            name: student.name || 'Student',
            grade: classInfo.grade || 'N/A',
            section: classInfo.name || 'N/A',
            avatar: student.name?.charAt(0) || 'S',
            completionRate: student.submittedCount > 0 
              ? Math.round((student.submittedCount / (student.submittedCount + student.pendingCount)) * 100) 
              : 0,
            projectsSubmitted: student.submittedCount || 0,
            pendingCount: student.pendingCount || 0,
            lateCount: student.lateCount || 0
          };
        });
        console.log('Transformed students:', transformedStudents);
        setAllStudents(transformedStudents);
      } else {
        console.error('Failed to load students:', result.error);
      }
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStudentDetails = async (studentId) => {
    try {
      const [submissionsResult, artworksResult] = await Promise.all([
        getStudentSubmissions(studentId),
        getStudentArtworks(studentId)
      ]);

      console.log('Submissions result:', submissionsResult);
      console.log('Artworks result:', artworksResult);

      if (submissionsResult.success) {
        setStudentSubmissions(submissionsResult.data || []);
      }
      if (artworksResult.success) {
        setStudentArtworks(artworksResult.data || []);
      }
    } catch (error) {
      console.error('Error loading student details:', error);
    }
  };

  // Get unique grades and sections
  const uniqueGrades = ['all', ...new Set(allStudents.map(s => s.grade))];
  const uniqueSections = ['all', ...new Set(allStudents.map(s => s.section))];

  // Filter and search students
  const filteredAndSortedStudents = useMemo(() => {
    let filtered = allStudents.filter(student => {
      const matchesSearch = 
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.id.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesGrade = selectedGrade === 'all' || student.grade === selectedGrade;
      const matchesSection = selectedSection === 'all' || student.section === selectedSection;
      
      return matchesSearch && matchesGrade && matchesSection;
    });

    // Sort students
    filtered.sort((a, b) => {
      switch(sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'completion':
          return b.completionRate - a.completionRate;
        case 'submitted':
          return b.projectsSubmitted - a.projectsSubmitted;
        case 'late':
          return b.lateCount - a.lateCount;
        default:
          return 0;
      }
    });

    return filtered;
  }, [allStudents, searchTerm, selectedGrade, selectedSection, sortBy]);

  // Transform submissions data for tabs
  const projects = useMemo(() => {
    const normalizedSubmissions = studentSubmissions.map((item) => ({
      ...item,
      normalizedStatus: String(item.status || '').toLowerCase()
    }));

    const submitted = normalizedSubmissions.filter((s) => ['submitted', 'reviewed', 'late'].includes(s.normalizedStatus));
    const assigned = normalizedSubmissions.filter((s) => s.normalizedStatus === 'assigned');
    const overdue = normalizedSubmissions.filter((s) => s.normalizedStatus === 'overdue');
    const created = studentArtworks;

    return {
      submitted: submitted.map((s) => ({
        id: s.id,
        title: s.activity_title || 'Untitled',
        status: s.normalizedStatus === 'reviewed'
          ? 'Reviewed'
          : s.normalizedStatus === 'late'
            ? 'Late Submitted'
            : 'Submitted',
        dueDate: s.due_date,
        submittedDate: s.submitted_at,
        reviewedDate: s.reviewed_at,
        score: s.score,
        feedback: s.feedback || ''
      })),
      assigned: assigned.map((s) => ({
        id: s.id,
        title: s.activity_title || 'Untitled',
        status: 'Assigned',
        dueDate: s.due_date,
        submittedDate: null
      })),
      overdue: overdue.map((s) => ({
        id: s.id,
        title: s.activity_title || 'Untitled',
        status: 'Overdue',
        dueDate: s.due_date,
        submittedDate: null
      })),
      created: created.map(a => ({
        id: a.id,
        title: a.title || 'Untitled',
        status: 'Created',
        dueDate: a.created_at,
        createdDate: a.created_at,
        image: '🎨',
        description: a.description || 'Student artwork'
      }))
    };
  }, [studentSubmissions, studentArtworks]);

  const getTabProjects = () => {
    return projects[activeTab] || [];
  };

  const getStatusColor = (status) => {
    switch(status) {
      case 'Reviewed': return 'status-completed';
      case 'Submitted': return 'status-review';
      case 'Late Submitted': return 'status-overdue';
      case 'Created': return 'status-progress';
      case 'Overdue': return 'status-overdue';
      case 'Assigned': return 'status-assigned';
      default: return 'status-default';
    }
  };

  const getPrintableStatus = (item) => {
    const normalized = String(item.status || '').toLowerCase();
    if (normalized === 'reviewed') return 'Reviewed';
    if (normalized === 'late') return 'Late Submitted';
    if (normalized === 'submitted') return 'Submitted';
    if (normalized === 'assigned') return 'Assigned';
    if (normalized === 'overdue') return 'Overdue';
    return item.status || 'N/A';
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.click();
    URL.revokeObjectURL(url);
  };

  const exportSectionGrades = async (format) => {
    if (!filteredAndSortedStudents.length) return;
    setExporting(true);
    try {
      const results = await Promise.all(filteredAndSortedStudents.map(async (student) => {
        const result = await getStudentSubmissions(student.id);
        return (result.success ? result.data : []).map((item) => ({
          'Student Name': student.name, Grade: student.grade, Section: student.section, 'Student ID': student.id,
          Activity: item.activity_title || item.activity?.title || 'Untitled', Status: getPrintableStatus(item),
          Due: formatDate(item.due_date, 'No due date'), Submitted: formatDate(item.submitted_at, 'Not submitted'),
          Reviewed: formatDate(item.reviewed_at, 'Not reviewed'), Rating: starRatingText(item.score), Feedback: item.feedback || '',
        }));
      }));
      const flatRows = results.flat();
      const activities = [...new Set(flatRows.map((row) => row.Activity))].sort((a, b) => a.localeCompare(b));
      const rows = filteredAndSortedStudents.map((student) => {
        const row = { Subject: 'E-Likha Arts and Crafts', 'Student Name': student.name, Grade: student.grade, Section: student.section, 'Student ID': student.id };
        activities.forEach((activity) => {
          const submission = flatRows.find((item) => item['Student ID'] === student.id && item.Activity === activity);
          row[`${activity} — Rating`] = submission?.Rating || 'Not rated';
          row[`${activity} — Status`] = submission?.Status || 'Not assigned';
          row[`${activity} — Feedback`] = submission?.Feedback || '';
        });
        return row;
      });
      const headers = Object.keys(rows[0] || { Subject: '', 'Student Name': '', Grade: '', Section: '', 'Student ID': '' });
      const filePart = (value) => String(value || '').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'All';
      const gradeName = selectedGrade === 'all' ? 'All-Grades' : selectedGrade;
      const sectionName = selectedSection === 'all' ? 'All-Sections' : selectedSection;
      const exportDate = new Date().toISOString().slice(0, 10);
      const fileName = `E-Likha_Arts-and-Crafts_Grades_${filePart(gradeName)}_${filePart(sectionName)}_${exportDate}`;
      if (format === 'csv') {
        const csv = [
          serializeCsvRow(headers),
          ...rows.map((row) => serializeCsvRow(headers.map((header) => row[header]))),
        ].join('\r\n');
        downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${fileName}.csv`);
      } else {
        const detailRows = flatRows.map((item) => ({
          Subject: 'E-Likha Arts and Crafts',
          'Student Name': item['Student Name'],
          Grade: item.Grade,
          Section: item.Section,
          'Student ID': item['Student ID'],
          Activity: item.Activity,
          Rating: item.Rating,
          Status: item.Status,
          Due: item.Due,
          Submitted: item.Submitted,
          Reviewed: item.Reviewed,
          Feedback: item.Feedback,
        }));
        const detailHeaders = Object.keys(detailRows[0] || { Subject: '', 'Student Name': '', Grade: '', Section: '', 'Student ID': '', Activity: '', Rating: '', Status: '', Due: '', Submitted: '', Reviewed: '', Feedback: '' });
        const book = new ExcelJS.Workbook();
        book.creator = 'E-Likha';
        book.created = new Date();
        const tableStyle = {
          theme: 'TableStyleMedium2',
          showRowStripes: true,
          showFirstColumn: false,
          showLastColumn: false,
        };
        const addGradeTable = (sheet, name, tableHeaders, tableRows, widths, frozenColumns = 0) => {
          sheet.views = [{ state: 'frozen', xSplit: frozenColumns, ySplit: 1 }];
          sheet.addTable({
            name,
            ref: 'A1',
            headerRow: true,
            totalsRow: false,
            style: tableStyle,
            columns: tableHeaders.map((header) => ({ name: header, filterButton: true })),
            rows: tableRows,
          });
          widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
          sheet.getRow(1).height = 28;
          sheet.eachRow((row) => {
            row.alignment = { vertical: 'top', wrapText: true };
          });
        };

        const summarySheet = book.addWorksheet('Export Summary');
        summarySheet.mergeCells('A1:D1');
        const titleCell = summarySheet.getCell('A1');
        titleCell.value = 'E-Likha — Section Grade Export';
        titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1800AD' } };
        titleCell.alignment = { vertical: 'middle' };
        summarySheet.getRow(1).height = 30;
        const reviewedCount = flatRows.filter((item) => item.Status === 'Reviewed').length;
        const ratedCount = flatRows.filter((item) => item.Rating !== 'Not rated').length;
        const summaryRows = [
          ['Subject', 'E-Likha Arts and Crafts'],
          ['Grade', gradeName],
          ['Section', sectionName],
          ['Learners', filteredAndSortedStudents.length],
          ['Activities', activities.length],
          ['Submission records', flatRows.length],
          ['Reviewed records', reviewedCount],
          ['Rated records', ratedCount],
          ['Generated', new Date().toLocaleString()],
        ];
        summaryRows.forEach((summaryRow, index) => {
          const row = summarySheet.getRow(index + 3);
          row.values = summaryRow;
          row.getCell(1).font = { bold: true, color: { argb: 'FF1800AD' } };
          row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E6FF' } };
        });
        summarySheet.getCell('A14').value = 'Tip';
        summarySheet.getCell('A14').font = { bold: true, color: { argb: 'FF1800AD' } };
        summarySheet.getCell('B14').value = 'Use the filter buttons in the other tabs to quickly view a learner, activity, rating, or submission status.';
        summarySheet.getCell('B14').alignment = { wrapText: true, vertical: 'top' };
        summarySheet.getColumn(1).width = 24;
        summarySheet.getColumn(2).width = 72;
        summarySheet.getColumn(3).width = 18;
        summarySheet.getColumn(4).width = 18;

        const gradebookSheet = book.addWorksheet('Section Grades');
        addGradeTable(
          gradebookSheet,
          'SectionGradesTable',
          headers,
          rows.map((row) => headers.map((header) => row[header] ?? '')),
          headers.map((header) => (header.includes('Feedback') ? 42 : header.includes('Student') ? 24 : header === 'Subject' ? 28 : 18)),
          4,
        );

        const detailSheet = book.addWorksheet('Submission Details');
        addGradeTable(
          detailSheet,
          'SubmissionDetailsTable',
          detailHeaders,
          detailRows.map((row) => detailHeaders.map((header) => row[header] ?? '')),
          detailHeaders.map((header) => (header === 'Feedback' ? 42 : header.includes('Student') || header === 'Activity' ? 28 : header === 'Subject' ? 28 : 18)),
          5,
        );

        const quickView = book.addWorksheet('Quick Grade View');
        quickView.views = [{ state: 'frozen', ySplit: 6 }];
        quickView.mergeCells('A1:L1');
        quickView.getCell('A1').value = 'E-Likha — Section Gradebook';
        quickView.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        quickView.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1800AD' } };
        quickView.getCell('A1').alignment = { vertical: 'middle' };
        quickView.getRow(1).height = 30;
        quickView.getCell('D3').value = 'Subject'; quickView.getCell('E3').value = 'E-Likha Arts and Crafts';
        quickView.getCell('D4').value = 'Grade'; quickView.getCell('E4').value = gradeName;
        quickView.getCell('G3').value = 'Section'; quickView.getCell('H3').value = sectionName;
        quickView.getCell('G4').value = 'Learners'; quickView.getCell('H4').value = filteredAndSortedStudents.length;
        quickView.getCell('J3').value = 'Activities'; quickView.getCell('K3').value = activities.length;
        quickView.getCell('J4').value = 'Generated'; quickView.getCell('K4').value = new Date().toLocaleString();
        ['D3', 'D4', 'G3', 'G4', 'J3', 'J4'].forEach((cell) => {
          quickView.getCell(cell).font = { bold: true, color: { argb: 'FF1800AD' } };
        });

        quickView.mergeCells('A3:B3');
        quickView.getCell('A3').value = 'Filter & Sort';
        quickView.getCell('A3').font = { bold: true, color: { argb: 'FFFFFFFF' } };
        quickView.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1800AD' } };
        quickView.mergeCells('A4:B4');
        quickView.getCell('A4').value = 'Use the drop-down arrows in the blue column headers below to filter or sort. All records are shown by default.';
        quickView.getCell('A4').alignment = { wrapText: true, vertical: 'top' };
        quickView.getCell('A4').font = { italic: true, color: { argb: 'FF4B5563' } };

        detailHeaders.forEach((header, index) => {
          const cell = quickView.getCell(6, index + 1);
          cell.value = header;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1800AD' } };
          cell.alignment = { wrapText: true, vertical: 'middle' };
        });
        quickView.getRow(6).height = 32;
        detailHeaders.forEach((header, index) => {
          quickView.getColumn(index + 1).width = header === 'Feedback' ? 42 : header.includes('Student') || header === 'Activity' ? 28 : header === 'Subject' ? 28 : 18;
        });
        quickView.addTable({
          name: 'QuickGradeViewTable',
          ref: 'A6',
          headerRow: true,
          totalsRow: false,
          style: tableStyle,
          columns: detailHeaders.map((header) => ({ name: header, filterButton: true })),
          rows: detailRows.map((row) => detailHeaders.map((header) => row[header] ?? '')),
        });
        quickView.eachRow((row) => { row.alignment = { vertical: 'top', wrapText: true }; });

        summarySheet.state = 'hidden';
        gradebookSheet.state = 'hidden';
        detailSheet.state = 'hidden';
        book.views = [{ activeTab: 3 }];

        const excelBuffer = await book.xlsx.writeBuffer();
        downloadBlob(new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileName}.xlsx`);
      }
    } catch (error) { alert(`Could not export grades: ${error.message || 'Unknown error'}`); }
    finally { setExporting(false); }
  };

  if (selectedStudent) {
    return (
      <div className="student-page-container">
        <Navbar />
        <main className="student-page">
          {/* Back Button */}
          <button className="back-btn" onClick={() => setSelectedStudent(null)}>
            ← Back to All Students
          </button>

          {/* Student Header */}
          <section className="student-header-section">
            <div className="student-header-content">
              <div className="student-avatar-large">{selectedStudent.avatar}</div>
              <div className="student-info">
                <h1 className="student-name">{selectedStudent.name}</h1>
                <p className="student-grade">{selectedStudent.grade} - Section {selectedStudent.section}</p>
                <p className="student-id">Student ID: {selectedStudent.id}</p>
              </div>
            </div>
          </section>

          {/* Statistics Cards */}
          <section className="student-stats">
            <div className="stat-card">
              <div className="stat-value">
                {projects.submitted.length > 0 
                  ? Math.round((projects.submitted.length / (projects.submitted.length + projects.assigned.length + projects.overdue.length)) * 100) 
                  : 0}%
              </div>
              <div className="stat-label">Completion Rate</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{projects.submitted.length}</div>
              <div className="stat-label">Projects Submitted</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{projects.assigned.length}</div>
              <div className="stat-label">Assigned</div>
            </div>
            <div className="stat-card status-overdue">
              <div className="stat-value">{projects.overdue.length}</div>
              <div className="stat-label">Overdue</div>
            </div>
          </section>

          {/* Projects Section */}
          <section className="projects-section">
            <h2 className="section-title">Projects</h2>
            
            {/* Project Tabs */}
            <div className="project-tabs">
              <button
                className={`tab-btn ${activeTab === 'submitted' ? 'active' : ''}`}
                onClick={() => setActiveTab('submitted')}
              >
                Submitted
              </button>
              <button
                className={`tab-btn ${activeTab === 'assigned' ? 'active' : ''}`}
                onClick={() => setActiveTab('assigned')}
              >
                Assigned
              </button>
              <button
                className={`tab-btn ${activeTab === 'overdue' ? 'active' : ''}`}
                onClick={() => setActiveTab('overdue')}
              >
                Overdue
              </button>
              <button
                className={`tab-btn ${activeTab === 'created' ? 'active' : ''}`}
                onClick={() => setActiveTab('created')}
              >
                Created
              </button>
            </div>

            {/* Projects List */}
            <div className="projects-list">
              {activeTab === 'created' ? (
                // Gallery View for Created Projects
                <div className="projects-gallery">
                  {getTabProjects().length === 0 ? (
                    <p className="no-projects">No projects in this category</p>
                  ) : (
                    getTabProjects().map((project) => (
                      <div key={project.id} className="gallery-card">
                        <div className="gallery-image">{project.image}</div>
                        <div className="gallery-info">
                          <h3 className="gallery-title">{project.title}</h3>
                          <p className="gallery-description">{project.description}</p>
                          <div className="gallery-meta">
                            <span className="gallery-due">Created: {formatDate(project.createdDate, 'Unknown date')}</span>
                            <span className={`project-status ${getStatusColor(project.status)}`}>
                              {project.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                // List View for Other Tabs
                <>
                  {getTabProjects().length === 0 ? (
                    <p className="no-projects">No projects in this category</p>
                  ) : (
                    getTabProjects().map((project) => (
                      <div key={project.id} className="project-card">
                        <div className="project-icon">📋</div>
                        <div className="project-content">
                          <h3 className="project-title">{project.title}</h3>
                          <div className="project-meta">
                            <span className="project-due">Due: {formatDate(project.dueDate)}</span>
                            {project.submittedDate && (
                              <span className="project-submitted">Submitted: {formatDate(project.submittedDate, 'Unknown date')}</span>
                            )}
                            {hasStarRating(project.score) && (
                              <span className="project-rating">Rating: {starRatingText(project.score)}</span>
                            )}
                          </div>
                        </div>
                        <span className={`project-status ${getStatusColor(project.status)}`}>
                          {project.status}
                        </span>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="student-page-container">
      <Navbar />
      <main className="student-page">
        <section className="students-header">
          <div><h1 className="students-title">My Students</h1><p className="students-subtitle">Manage and track {filteredAndSortedStudents.length} of {allStudents.length} students</p></div>
          <div className="section-export"><button type="button" className="export-grades-btn" onClick={() => setExportMenuOpen((open) => !open)} disabled={exporting || !filteredAndSortedStudents.length} aria-haspopup="menu" aria-expanded={exportMenuOpen}>{exporting ? 'Preparing export…' : 'Export Grades'} <span aria-hidden="true">▾</span></button>{exportMenuOpen && <div className="section-export-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); exportSectionGrades('csv'); }} disabled={exporting}>Export as CSV</button><button type="button" role="menuitem" onClick={() => { setExportMenuOpen(false); exportSectionGrades('xlsx'); }} disabled={exporting}>Export as Excel</button></div>}</div>
        </section>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6B5A4D' }}>
            Loading students...
          </div>
        ) : (
          <>
            {/* Search and Filter Section */}
          {/* Search Bar */}
          <div className="student-search-container">
            <div className="student-search-input-wrapper">
              <span className="search-icon">🔍</span>
              <svg className="student-search-icon-svg" viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4.2 4.2" />
              </svg>
              <input
                type="text"
                placeholder="Search by name or student ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="student-search-input"
              />
              {searchTerm && (
                <button
                  type="button"
                  className="student-clear-search-btn"
                  onClick={() => setSearchTerm('')}
                  aria-label="Clear search"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filters and Sort */}
          <div className="student-filters-container">
            {/* Grade Filter */}
            <div className="filter-group">
              <label className="filter-label">Grade:</label>
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="filter-select"
              >
                {uniqueGrades.map(grade => (
                  <option key={grade} value={grade}>
                    {grade === 'all' ? 'All Grades' : grade}
                  </option>
                ))}
              </select>
            </div>

            {/* Section Filter */}
            <div className="filter-group">
              <label className="filter-label">Section:</label>
              <select
                value={selectedSection}
                onChange={(e) => setSelectedSection(e.target.value)}
                className="filter-select"
              >
                {uniqueSections.map(section => (
                  <option key={section} value={section}>
                    {section === 'all' ? 'All Sections' : `Section ${section}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort By */}
            <div className="filter-group">
              <label className="filter-label">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="filter-select"
              >
                <option value="name">Name (A-Z)</option>
                <option value="completion">Completion Rate (High to Low)</option>
                <option value="submitted">Projects Submitted (High to Low)</option>
                <option value="late">Late Projects (High to Low)</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(searchTerm || selectedGrade !== 'all' || selectedSection !== 'all' || sortBy !== 'name') && (
              <button
                className="reset-filters-btn"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedGrade('all');
                  setSelectedSection('all');
                  setSortBy('name');
                }}
              >
                Reset Filters
              </button>
            )}
          </div>

        {/* Students Grid */}
        <section className="students-grid">
          {filteredAndSortedStudents.length === 0 ? (
            <div className="no-results">
              <p className="no-results-text">No students found matching your criteria</p>
            </div>
          ) : (
            filteredAndSortedStudents.map((student) => (
              <div
                key={student.id}
                className="student-card"
                onClick={() => setSelectedStudent(student)}
              >
                <div className="student-card-avatar">{student.avatar}</div>
                <div className="student-card-header">
                  <h3 className="student-card-name">{student.name}</h3>
                  <p className="student-card-grade">{student.grade}</p>
                  <p className="student-card-section">Section {student.section}</p>
                  <p className="student-card-id">{student.id}</p>
                </div>
                <div className="student-card-stats">
                  <div className="card-stat">
                    <span className="card-stat-value">{student.completionRate}%</span>
                    <span className="card-stat-label">Complete</span>
                  </div>
                  <div className="card-stat">
                    <span className="card-stat-value">{student.projectsSubmitted}</span>
                    <span className="card-stat-label">Submitted</span>
                  </div>
                  <div className="card-stat">
                    <span className="card-stat-value">{student.pendingCount}</span>
                    <span className="card-stat-label">Pending</span>
                  </div>
                  {student.lateCount > 0 && (
                    <div className="card-stat status-alert">
                      <span className="card-stat-value">{student.lateCount}</span>
                      <span className="card-stat-label">Late</span>
                    </div>
                  )}
                </div>
                <button className="view-btn">View Details →</button>
              </div>
            ))
          )}
        </section>
          </>
        )}
      </main>
    </div>
  );
};

export default Student;
